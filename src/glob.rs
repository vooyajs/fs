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
/// Only complete literal components preceding the first wildcard become the root.
fn extract_path_prefix(pattern: &str) -> Option<(String, String)> {
  let first_glob = pattern.find(['*', '?', '[', '{', '('])?;
  let separator = pattern[..first_glob].rfind('/')?;
  let prefix = &pattern[..separator];
  if prefix.is_empty() || prefix == "." {
    return None;
  }
  Some((prefix.to_string(), pattern[separator + 1..].to_string()))
}

// Apply the result matcher separately from traversal so positive patterns cannot
// override gitignore rules. Matching files and directories are included:
//   - "src/*"   → returns files AND subdirs under src/
//   - "**/*.rs" → returns only .rs files (dirs don't match)
//   - "**"      → returns all files and dirs, including the root

#[napi(object)]
#[derive(Clone)]
pub struct GlobOptions {
  pub cwd: Option<String>,
  pub with_file_types: Option<bool>,
  pub exclude: Option<Vec<String>>,
  pub concurrency: Option<u32>,
  pub git_ignore: Option<bool>,
}

fn glob_one(
  pattern: String,
  options: Option<GlobOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  let pattern = pattern.trim_start_matches("./").to_string();
  let opts = options.unwrap_or(GlobOptions {
    cwd: None,
    with_file_types: None,
    exclude: None,
    concurrency: None,
    git_ignore: None,
  });

  let cwd = opts.cwd.unwrap_or_else(|| ".".to_string());
  let cwd_path = std::path::absolute(&cwd)
    .map_err(|error| crate::fs_error::io(error, "scandir", Path::new(&cwd)))?;
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
    None => (
      cwd_path.to_string_lossy().into_owned(),
      pattern.clone(),
      None,
    ),
  };

  // Node treats a missing cwd or a missing literal pattern prefix as a
  // successful no-match. Avoid turning the walker's root ENOENT into a rejected
  // glob. Unreadable directories are also skipped during traversal.
  match Path::new(&walk_root).try_exists() {
    Ok(false) | Err(_) => {
      return Ok(if with_file_types {
        Either::B(Vec::new())
      } else {
        Either::A(Vec::new())
      });
    }
    Ok(true) => {}
  }

  // Build override (whitelist) relative to walk_root
  let mut override_builder = OverrideBuilder::new(&walk_root);
  override_builder
    .case_insensitive(cfg!(any(target_os = "macos", windows)))
    .map_err(|error| Error::from_reason(error.to_string()))?;
  // `ignore` treats a pattern without a leading slash as matching at any depth,
  // while Node's glob patterns are rooted at `cwd` (or the extracted literal
  // prefix). Anchor every pattern; `**` still opts into recursive matching.
  let anchored_pattern = format!("/{}", pattern_for_override.trim_start_matches('/'));
  override_builder
    .add(&anchored_pattern)
    .map_err(|e| Error::from_reason(e.to_string()))?;

  let mut exclude_builder = globset::GlobSetBuilder::new();
  for pattern in opts.exclude.as_deref().unwrap_or_default() {
    exclude_builder.add(
      globset::GlobBuilder::new(pattern)
        .literal_separator(true)
        .case_insensitive(false)
        .build()
        .map_err(|error| Error::from_reason(error.to_string()))?,
    );
  }
  let exclude_matcher = Arc::new(
    exclude_builder
      .build()
      .map_err(|error| Error::from_reason(error.to_string()))?,
  );

  let overrides = override_builder
    .build()
    .map_err(|e| Error::from_reason(e.to_string()))?;

  let dir_matcher = Arc::new(overrides.clone());

  let mut builder = WalkBuilder::new(&walk_root);
  builder
    .standard_filters(opts.git_ignore.unwrap_or(false))
    .require_git(false)
    .hidden(false)
    .threads(concurrency);
  let explicit_dot = pattern_for_override
    .split('/')
    .filter(|part| part.starts_with('.'))
    .map(str::to_string)
    .collect::<Vec<_>>();
  builder.filter_entry(move |entry| {
    entry.depth() == 0
      || !entry.file_name().to_string_lossy().starts_with('.')
      || explicit_dot.iter().any(|part| {
        let name = entry.file_name().to_string_lossy();
        part == name.as_ref()
          || part == ".*"
          || (part.ends_with('*') && name.starts_with(part.trim_end_matches('*')))
      })
  });

  // We use two vectors to avoid enum overhead in the lock if possible, but Mutex<Vec<T>> is easier
  let result_strings = Arc::new(Mutex::new(Vec::new()));
  let result_dirents = Arc::new(Mutex::new(Vec::new()));
  let walk_error = Arc::new(Mutex::new(None));

  let result_strings_clone = result_strings.clone();
  let result_dirents_clone = result_dirents.clone();
  let walk_error_clone = walk_error.clone();

  let root_path = Path::new(&walk_root).to_path_buf();
  let include_root = pattern_for_override == "**";
  let result_root = cwd_path.clone();

  builder.build_parallel().run(move || {
    let result_strings = result_strings_clone.clone();
    let result_dirents = result_dirents_clone.clone();
    let walk_error = walk_error_clone.clone();
    let root = root_path.clone();
    let dir_matcher = dir_matcher.clone();
    let exclude_matcher = exclude_matcher.clone();
    let result_root = result_root.clone();

    Box::new(move |entry| {
      let entry = match entry {
        Ok(e) => e,
        Err(error) => {
          // Node glob treats unreadable or concurrently removed directories as no matches.
          if error.io_error().is_some() {
            return ignore::WalkState::Continue;
          }
          *walk_error.lock().unwrap() = Some(crate::fs_error::walk(error, &root));
          return ignore::WalkState::Quit;
        }
      };

      let result_relative = entry
        .path()
        .strip_prefix(&result_root)
        .unwrap_or(entry.path())
        .to_string_lossy()
        .replace('\\', "/");
      let is_dir = entry.file_type().is_some_and(|kind| kind.is_dir());
      let excluded = exclude_matcher.is_match(&result_relative);
      let skip_children = is_dir && exclude_matcher.is_match(format!("{result_relative}/"));
      if excluded || (skip_children && (include_root || entry.depth() == 0)) {
        return ignore::WalkState::Skip;
      }
      // Only a terminal globstar includes the walk root itself.
      if entry.depth() == 0 {
        if include_root {
          if with_file_types {
            result_dirents.lock().unwrap().push(Dirent {
              name: Either::A(
                entry
                  .path()
                  .file_name()
                  .unwrap_or_default()
                  .to_string_lossy()
                  .into_owned(),
              ),
              parent_path: entry
                .path()
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .into_owned(),
              file_type: 2,
            });
          } else {
            result_strings.lock().unwrap().push(".".to_string());
          }
        }
        return ignore::WalkState::Continue;
      }

      let path = entry.path();
      let relative_path = path.strip_prefix(&root).unwrap_or(path);
      let relative_path_str = relative_path.to_string_lossy().to_string();

      let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

      if !dir_matcher.matched(relative_path, is_dir).is_whitelist() {
        return if skip_children {
          ignore::WalkState::Skip
        } else {
          ignore::WalkState::Continue
        };
      }

      if with_file_types {
        let mut lock = result_dirents.lock().unwrap();
        let parent_path = path
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
          name: Either::A(name),
          parent_path,
          file_type,
        });
      } else {
        let mut lock = result_strings.lock().unwrap();
        lock.push(relative_path_str);
      }

      if skip_children {
        ignore::WalkState::Skip
      } else {
        ignore::WalkState::Continue
      }
    })
  });

  if let Some(error) = walk_error
    .lock()
    .map_err(|_| Error::from_reason("glob error lock poisoned"))?
    .take()
  {
    return Err(error);
  }

  if with_file_types {
    let final_results = Arc::try_unwrap(result_dirents)
      .map_err(|_| Error::from_reason("Lock error"))?
      .into_inner()
      .map_err(|_| Error::from_reason("Mutex error"))?;

    Ok(Either::B(final_results))
  } else {
    let mut final_results = Arc::try_unwrap(result_strings)
      .map_err(|_| Error::from_reason("Lock error"))?
      .into_inner()
      .map_err(|_| Error::from_reason("Mutex error"))?;
    if let Some(ref prefix) = result_prefix {
      for r in final_results.iter_mut() {
        *r = if r == "." {
          prefix.to_string_lossy().into_owned()
        } else {
          prefix.join(r.as_str()).to_string_lossy().into_owned()
        };
      }
    }
    Ok(Either::A(final_results))
  }
}

fn glob_impl(
  pattern: Either<String, Vec<String>>,
  options: Option<GlobOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  let patterns = match pattern {
    Either::A(pattern) => vec![pattern],
    Either::B(patterns) => patterns,
  };
  let with_types = options
    .as_ref()
    .and_then(|opts| opts.with_file_types)
    .unwrap_or(false);
  let mut strings = Vec::new();
  let mut dirents = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for pattern in patterns {
    match glob_one(pattern, options.clone())? {
      Either::A(entries) => {
        for value in entries {
          if seen.insert(value.clone()) {
            strings.push(value);
          }
        }
      }
      Either::B(entries) => {
        for value in entries {
          let key = match &value.name {
            Either::A(name) => format!("{}/{}", value.parent_path, name),
            Either::B(_) => unreachable!(),
          };
          if seen.insert(key) {
            dirents.push(value);
          }
        }
      }
    }
  }
  Ok(if with_types {
    Either::B(dirents)
  } else {
    Either::A(strings)
  })
}

#[napi(js_name = "globSync")]
pub fn glob_sync(
  env: Env,
  pattern: Either<String, Vec<String>>,
  options: Option<GlobOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  glob_impl(pattern, options).map_err(|error| crate::fs_error::into_js(env, error))
}

// ===== Async version =====
pub struct GlobTask {
  pub pattern: Either<String, Vec<String>>,
  pub options: Option<GlobOptions>,
}

impl Task for GlobTask {
  type Output = Either<Vec<String>, Vec<Dirent>>;
  type JsValue = Either<Vec<String>, Vec<Dirent>>;

  fn compute(&mut self) -> Result<Self::Output> {
    glob_impl(self.pattern.clone(), self.options.clone())
  }

  fn reject(&mut self, env: Env, error: Error) -> Result<Self::JsValue> {
    Err(crate::fs_error::into_js(env, error))
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(
  js_name = "glob",
  ts_return_type = "Promise<Array<string> | Array<Dirent>>"
)]
pub fn glob(
  pattern: Either<String, Vec<String>>,
  options: Option<GlobOptions>,
) -> AsyncTask<GlobTask> {
  AsyncTask::new(GlobTask { pattern, options })
}
