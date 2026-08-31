use crate::types::Dirent;
use crate::utils::get_file_type_id;
use ignore::{overrides::OverrideBuilder, WalkBuilder};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Extract leading path prefix from pattern so we can walk from that directory.
/// e.g. ".vooya-fs-glob-check/**/*.txt" -> (".vooya-fs-glob-check", "**/*.txt")
///      "**/*.txt" -> None (no prefix)
/// This aligns with Node.js: pattern with path prefix uses that path as the search root.
/// We scan for the first of * ? [ so that patterns like "dir?/sub/**/*.ts" use "dir?" as prefix
/// (no literal dir? on disk) rather than "dir?/sub", which would wrongly be used as walk root.
fn extract_path_prefix(pattern: &str) -> Option<(String, String)> {
  let first_glob = pattern.find(['*', '?', '['])?;
  let prefix = pattern[..first_glob]
    .trim_end_matches('/')
    .trim_end_matches(std::path::MAIN_SEPARATOR);
  if prefix.is_empty() || prefix == "." {
    return None;
  }
  Some((prefix.to_string(), pattern[first_glob..].to_string()))
}

// The ignore crate filters files by override whitelist; directories are always traversed
// (so we can recurse to find matching children). We use dir_matcher to test whether a
// directory path itself matches the pattern; only matching directories are included in
// results — aligned with Node.js fs.globSync:
//   - "src/*"   → returns files AND subdirs under src/
//   - "**/*.rs" → returns only .rs files (dirs don't match)
//   - "**"      → returns all files and dirs (excluding the cwd root itself)

#[napi(object)]
#[derive(Clone)]
pub struct GlobOptions {
  pub cwd: Option<String>,
  pub with_file_types: Option<bool>,
  pub exclude: Option<Vec<String>>,
  pub concurrency: Option<u32>,
  pub git_ignore: Option<bool>,
}

#[napi(js_name = "globSync")]
pub fn glob_sync(
  pattern: String,
  options: Option<GlobOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  let opts = options.unwrap_or(GlobOptions {
    cwd: None,
    with_file_types: None,
    exclude: None,
    concurrency: None,
    git_ignore: None,
  });

  let cwd = opts.cwd.unwrap_or_else(|| ".".to_string());
  let cwd_path = Path::new(&cwd).to_path_buf();
  let with_file_types = opts.with_file_types.unwrap_or(false);
  let concurrency = opts.concurrency.unwrap_or(4) as usize;

  // When pattern has a path prefix (e.g. "dir/**/*.txt" or ".hidden/**/*.txt"), use that as the
  // walk root so we descend into it (fixes hidden dirs and matches Node.js behavior).
  let (walk_root, pattern_for_override, result_prefix) = match extract_path_prefix(&pattern) {
    Some((prefix, rest)) => {
      let root = cwd_path.join(&prefix);
      (
        root.to_string_lossy().to_string(),
        rest,
        Some(PathBuf::from(prefix)),
      )
    }
    None => (cwd.clone(), pattern.clone(), None),
  };

  // Node treats a missing cwd or a missing literal pattern prefix as a
  // successful no-match. Avoid turning the walker's root ENOENT into a rejected
  // glob while still propagating errors encountered after traversal begins.
  match Path::new(&walk_root).try_exists() {
    Ok(false) => {
      return Ok(if with_file_types {
        Either::B(Vec::new())
      } else {
        Either::A(Vec::new())
      });
    }
    Err(error) => return Err(Error::from_reason(error.to_string())),
    Ok(true) => {}
  }

  // Build override (whitelist) relative to walk_root
  let mut override_builder = OverrideBuilder::new(&walk_root);
  // `ignore` treats a pattern without a leading slash as matching at any depth,
  // while Node's glob patterns are rooted at `cwd` (or the extracted literal
  // prefix). Anchor every pattern; `**` still opts into recursive matching.
  let anchored_pattern = format!("/{}", pattern_for_override.trim_start_matches('/'));
  override_builder
    .add(&anchored_pattern)
    .map_err(|e| Error::from_reason(e.to_string()))?;

  if let Some(ref excludes) = opts.exclude {
    for ex in excludes {
      override_builder
        .add(&format!("!/{}", ex.trim_start_matches('/')))
        .map_err(|e| Error::from_reason(e.to_string()))?;
    }
  }

  let overrides = override_builder
    .build()
    .map_err(|e| Error::from_reason(e.to_string()))?;

  let dir_matcher = Arc::new(overrides.clone());

  let mut builder = WalkBuilder::new(&walk_root);
  builder
    .overrides(overrides)
    .standard_filters(opts.git_ignore.unwrap_or(false))
    .threads(concurrency);

  // We use two vectors to avoid enum overhead in the lock if possible, but Mutex<Vec<T>> is easier
  let result_strings = Arc::new(Mutex::new(Vec::new()));
  let result_dirents = Arc::new(Mutex::new(Vec::new()));
  let walk_error = Arc::new(Mutex::new(None));

  let result_strings_clone = result_strings.clone();
  let result_dirents_clone = result_dirents.clone();
  let walk_error_clone = walk_error.clone();

  let root_path = Path::new(&walk_root).to_path_buf();

  builder.build_parallel().run(move || {
    let result_strings = result_strings_clone.clone();
    let result_dirents = result_dirents_clone.clone();
    let walk_error = walk_error_clone.clone();
    let root = root_path.clone();
    let dir_matcher = dir_matcher.clone();

    Box::new(move |entry| {
      let entry = match entry {
        Ok(e) => e,
        Err(error) => {
          *walk_error.lock().unwrap() = Some(error.to_string());
          return ignore::WalkState::Quit;
        }
      };

      // 跳过 cwd 根节点自身（depth 0）
      if entry.depth() == 0 {
        return ignore::WalkState::Continue;
      }

      let path = entry.path();
      let relative_path = path.strip_prefix(&root).unwrap_or(path);
      let relative_path_str = relative_path.to_string_lossy().to_string();

      let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

      if is_dir {
        // 目录：ignore crate 只为遍历而产出，需单独测试路径是否符合模式。
        // 与 Node.js 行为一致：模式 "src/*" 会同时返回 src/ 下的文件和子目录。
        let matched = dir_matcher.matched(relative_path, true);
        if !matched.is_whitelist() {
          // 目录本身不匹配模式，但仍继续遍历以便找到匹配的子条目
          return ignore::WalkState::Continue;
        }
        // 目录匹配模式，加入结果后继续遍历
      }
      // 非目录条目：ignore crate 的 override 白名单已确保它们匹配模式

      if with_file_types {
        let mut lock = result_dirents.lock().unwrap();
        let parent_path = relative_path
          .parent()
          .unwrap_or(Path::new(""))
          .to_string_lossy()
          .to_string();
        let name = relative_path
          .file_name()
          .unwrap_or_default()
          .to_string_lossy()
          .to_string();
        let file_type = if let Some(ft) = entry.file_type() {
          get_file_type_id(&ft)
        } else {
          0
        };
        lock.push(Dirent {
          name,
          parent_path,
          file_type,
        });
      } else {
        let mut lock = result_strings.lock().unwrap();
        lock.push(relative_path_str);
      }

      ignore::WalkState::Continue
    })
  });

  if let Some(error) = walk_error
    .lock()
    .map_err(|_| Error::from_reason("glob error lock poisoned"))?
    .take()
  {
    return Err(Error::from_reason(error));
  }

  if with_file_types {
    let mut final_results = Arc::try_unwrap(result_dirents)
      .map_err(|_| Error::from_reason("Lock error"))?
      .into_inner()
      .map_err(|_| Error::from_reason("Mutex error"))?;
    if let Some(ref prefix) = result_prefix {
      for d in final_results.iter_mut() {
        d.parent_path = prefix.join(&d.parent_path).to_string_lossy().to_string();
      }
    }
    Ok(Either::B(final_results))
  } else {
    let mut final_results = Arc::try_unwrap(result_strings)
      .map_err(|_| Error::from_reason("Lock error"))?
      .into_inner()
      .map_err(|_| Error::from_reason("Mutex error"))?;
    if let Some(ref prefix) = result_prefix {
      for r in final_results.iter_mut() {
        *r = prefix.join(r.as_str()).to_string_lossy().to_string();
      }
    }
    Ok(Either::A(final_results))
  }
}

// ===== Async version =====
pub struct GlobTask {
  pub pattern: String,
  pub options: Option<GlobOptions>,
}

impl Task for GlobTask {
  type Output = Either<Vec<String>, Vec<Dirent>>;
  type JsValue = Either<Vec<String>, Vec<Dirent>>;

  fn compute(&mut self) -> Result<Self::Output> {
    glob_sync(self.pattern.clone(), self.options.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(
  js_name = "glob",
  ts_return_type = "Promise<Array<string> | Array<Dirent>>"
)]
pub fn glob(pattern: String, options: Option<GlobOptions>) -> AsyncTask<GlobTask> {
  AsyncTask::new(GlobTask { pattern, options })
}
