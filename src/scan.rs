use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use ignore::{overrides::OverrideBuilder, WalkBuilder, WalkState};

#[napi(object)]
#[derive(Clone)]
pub struct ScanOptions {
  /// Glob patterns rooted at `root`. Defaults to `**`.
  pub include: Option<Vec<String>>,
  /// Glob patterns to omit from the result.
  pub exclude: Option<Vec<String>>,
  /// Include matching directories as well as files. Defaults to false.
  pub with_directories: Option<bool>,
  /// Follow symbolic links while walking and when collecting metadata.
  pub follow_symlinks: Option<bool>,
  /// Apply .gitignore and other standard ignore files. Defaults to false.
  pub git_ignore: Option<bool>,
  /// Skip hidden files and directories. Defaults to false.
  pub skip_hidden: Option<bool>,
  /// Number of traversal threads. Zero selects the runtime heuristic.
  pub concurrency: Option<u32>,
}

#[napi(object)]
#[derive(Clone)]
pub struct ScanEntry {
  /// Path relative to the scan root.
  pub path: String,
  pub name: String,
  /// One of file, directory, symlink, or other.
  pub kind: String,
  pub size: f64,
  pub mode: u32,
  pub mtime_ms: f64,
  pub depth: u32,
}

struct ThreadBatch {
  local: Vec<ScanEntry>,
  shared: Arc<Mutex<Vec<ScanEntry>>>,
}

impl ThreadBatch {
  fn new(shared: Arc<Mutex<Vec<ScanEntry>>>) -> Self {
    Self {
      local: Vec::with_capacity(256),
      shared,
    }
  }
}

impl Drop for ThreadBatch {
  fn drop(&mut self) {
    if let Ok(mut shared) = self.shared.lock() {
      shared.append(&mut self.local);
    }
  }
}

fn anchored(pattern: &str) -> String {
  format!("/{}", pattern.trim_start_matches('/'))
}

fn modified_ms(metadata: &fs::Metadata) -> f64 {
  use std::time::UNIX_EPOCH;
  metadata.modified().map_or(0.0, |time| {
    time.duration_since(UNIX_EPOCH).map_or_else(
      |error| -error.duration().as_secs_f64() * 1000.0,
      |duration| duration.as_secs_f64() * 1000.0,
    )
  })
}

#[cfg(unix)]
fn metadata_mode(metadata: &fs::Metadata) -> u32 {
  use std::os::unix::fs::MetadataExt;
  metadata.mode()
}

#[cfg(not(unix))]
fn metadata_mode(metadata: &fs::Metadata) -> u32 {
  let kind = if metadata.is_dir() {
    0o040000
  } else {
    0o100000
  };
  let permissions = if metadata.permissions().readonly() {
    0o444
  } else {
    0o666
  };
  kind | permissions
}

fn scan_impl(root_str: String, options: Option<ScanOptions>) -> Result<Vec<ScanEntry>> {
  let root = Path::new(if root_str.is_empty() { "." } else { &root_str }).to_path_buf();
  let opts = options.unwrap_or(ScanOptions {
    include: None,
    exclude: None,
    with_directories: None,
    follow_symlinks: None,
    git_ignore: None,
    skip_hidden: None,
    concurrency: None,
  });
  let includes = opts.include.unwrap_or_else(|| vec!["**".to_string()]);
  if includes.is_empty() {
    return Ok(Vec::new());
  }

  let mut override_builder = OverrideBuilder::new(&root);
  for pattern in &includes {
    override_builder
      .add(&anchored(pattern))
      .map_err(|error| Error::from_reason(error.to_string()))?;
  }
  for pattern in opts.exclude.as_deref().unwrap_or_default() {
    override_builder
      .add(&format!("!{}", anchored(pattern)))
      .map_err(|error| Error::from_reason(error.to_string()))?;
  }
  let overrides = override_builder
    .build()
    .map_err(|error| Error::from_reason(error.to_string()))?;
  let directory_matcher = Arc::new(overrides.clone());

  let follow_symlinks = opts.follow_symlinks.unwrap_or(false);
  let with_directories = opts.with_directories.unwrap_or(false);
  let mut builder = WalkBuilder::new(&root);
  builder
    .overrides(overrides)
    .standard_filters(opts.git_ignore.unwrap_or(false))
    .hidden(opts.skip_hidden.unwrap_or(false))
    .follow_links(follow_symlinks)
    .threads(opts.concurrency.unwrap_or(0) as usize);
  if opts.skip_hidden.unwrap_or(false) {
    builder.filter_entry(|entry| {
      entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    });
  }

  let entries = Arc::new(Mutex::new(Vec::new()));
  let walk_error = Arc::new(Mutex::new(None));
  let root_for_walk = root.clone();
  let entries_for_walk = entries.clone();
  let error_for_walk = walk_error.clone();

  builder.build_parallel().run(move || {
    let root = root_for_walk.clone();
    let directory_matcher = directory_matcher.clone();
    let mut batch = ThreadBatch::new(entries_for_walk.clone());
    let walk_error = error_for_walk.clone();

    Box::new(move |result| {
      let entry = match result {
        Ok(entry) => entry,
        Err(error) => {
          *walk_error.lock().unwrap() = Some(error.to_string());
          return WalkState::Quit;
        }
      };
      if entry.depth() == 0 {
        return WalkState::Continue;
      }

      let path = entry.path();
      let relative = path.strip_prefix(&root).unwrap_or(path);
      let is_directory = entry.file_type().is_some_and(|kind| kind.is_dir());
      if is_directory
        && (!with_directories || !directory_matcher.matched(relative, true).is_whitelist())
      {
        return WalkState::Continue;
      }

      let metadata = if follow_symlinks {
        fs::metadata(path)
      } else {
        fs::symlink_metadata(path)
      };
      let metadata = match metadata {
        Ok(metadata) => metadata,
        Err(error) => {
          *walk_error.lock().unwrap() = Some(format!("{}: {}", path.display(), error));
          return WalkState::Quit;
        }
      };
      let file_type = metadata.file_type();
      let kind = if file_type.is_file() {
        "file"
      } else if file_type.is_dir() {
        "directory"
      } else if file_type.is_symlink() {
        "symlink"
      } else {
        "other"
      };

      batch.local.push(ScanEntry {
        path: relative.to_string_lossy().to_string(),
        name: path
          .file_name()
          .unwrap_or_default()
          .to_string_lossy()
          .to_string(),
        kind: kind.to_string(),
        size: metadata.len() as f64,
        mode: metadata_mode(&metadata),
        mtime_ms: modified_ms(&metadata),
        depth: entry.depth() as u32,
      });
      WalkState::Continue
    })
  });

  if let Some(error) = walk_error
    .lock()
    .map_err(|_| Error::from_reason("scan error lock poisoned"))?
    .take()
  {
    return Err(Error::from_reason(error));
  }

  let mut entries = Arc::try_unwrap(entries)
    .map_err(|_| Error::from_reason("scan result is still shared"))?
    .into_inner()
    .map_err(|_| Error::from_reason("scan result lock poisoned"))?;
  entries.sort_unstable_by(|left, right| left.path.cmp(&right.path));
  Ok(entries)
}

#[napi(js_name = "scanSync")]
pub fn scan_sync(root: String, options: Option<ScanOptions>) -> Result<Vec<ScanEntry>> {
  scan_impl(root, options)
}

pub struct ScanTask {
  pub root: String,
  pub options: Option<ScanOptions>,
}

impl Task for ScanTask {
  type Output = Vec<ScanEntry>;
  type JsValue = Vec<ScanEntry>;

  fn compute(&mut self) -> Result<Self::Output> {
    scan_impl(self.root.clone(), self.options.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "scan", ts_return_type = "Promise<Array<ScanEntry>>")]
pub fn scan(root: String, options: Option<ScanOptions>) -> AsyncTask<ScanTask> {
  AsyncTask::new(ScanTask { root, options })
}
