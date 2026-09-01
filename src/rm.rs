use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use std::fs;
use std::io;
use std::path::Path;

/// Removes files and directories (modeled on the standard POSIX `rm` utility).
///
/// - `force`: When true, silently ignore errors when path does not exist.
/// - `recursive`: When true, remove directory and all its contents.
/// - `maxRetries`: If an `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`, or `EPERM` error is
///   encountered, Node.js retries the operation with a linear backoff of `retryDelay` ms longer on
///   each try. This option represents the number of retries.
/// - `retryDelay`: The amount of time in milliseconds to wait between retries (default 100ms).
/// - `concurrency` (vooya-fs extension): Number of parallel threads for recursive removal.

#[napi(object)]
#[derive(Clone)]
pub struct RmOptions {
  pub force: Option<bool>,
  pub max_retries: Option<u32>,
  pub recursive: Option<bool>,
  pub retry_delay: Option<u32>,
  pub concurrency: Option<u32>,
}

fn remove_recursive(path: &Path, recursive: bool, parallel: bool) -> io::Result<()> {
  let meta = fs::symlink_metadata(path)?;

  if meta.is_dir() {
    if recursive {
      let entries_iter = fs::read_dir(path)?;

      if parallel {
        let entries: Vec<_> = entries_iter.collect::<io::Result<_>>()?;
        entries
          .par_iter()
          .try_for_each(|entry| remove_recursive(&entry.path(), true, true))?;
      } else {
        for entry in entries_iter {
          remove_recursive(&entry?.path(), true, false)?;
        }
      }

      fs::remove_dir(path)?;
    } else {
      fs::remove_dir(path)?;
    }
  } else {
    fs::remove_file(path)?;
  }
  Ok(())
}

fn is_retryable(error: &io::Error) -> bool {
  if matches!(
    error.kind(),
    io::ErrorKind::PermissionDenied | io::ErrorKind::DirectoryNotEmpty
  ) {
    return true;
  }

  #[cfg(unix)]
  return matches!(
    error.raw_os_error(),
    Some(libc::EBUSY | libc::EMFILE | libc::ENFILE | libc::ENOTEMPTY | libc::EPERM)
  );

  #[cfg(not(unix))]
  false
}

fn remove_once(path: &Path, opts: &RmOptions) -> io::Result<()> {
  let recursive = opts.recursive.unwrap_or(false);
  let concurrency = opts.concurrency.unwrap_or(1);
  if recursive && concurrency > 1 {
    let pool = ThreadPoolBuilder::new()
      .num_threads(concurrency as usize)
      .build()
      .map_err(io::Error::other)?;
    pool.install(|| remove_recursive(path, true, true))
  } else {
    remove_recursive(path, recursive, false)
  }
}

fn remove_with_retry(path: &Path, opts: &RmOptions) -> io::Result<()> {
  let max_retries = opts.max_retries.unwrap_or(0) as usize;
  let retry_delay = opts.retry_delay.unwrap_or(100) as u64;

  let mut last_err = None;
  for attempt in 0..=max_retries {
    if attempt > 0 {
      std::thread::sleep(std::time::Duration::from_millis(
        retry_delay * attempt as u64,
      ));
    }
    match remove_once(path, opts) {
      Ok(()) => return Ok(()),
      Err(error) if attempt < max_retries && is_retryable(&error) => last_err = Some(error),
      Err(error) => return Err(error),
    }
  }
  Err(last_err.unwrap_or_else(|| io::Error::other("remove failed without an error")))
}

fn remove_error(path: &Path, error: io::Error) -> Error {
  let reason = match error.kind() {
    io::ErrorKind::NotFound => "ENOENT: no such file or directory",
    io::ErrorKind::PermissionDenied => "EPERM: operation not permitted",
    io::ErrorKind::DirectoryNotEmpty => "ENOTEMPTY: directory not empty",
    _ => {
      return Error::from_reason(format!("{}, rm '{}'", error, path.to_string_lossy()));
    }
  };
  Error::from_reason(format!("{}, rm '{}'", reason, path.to_string_lossy()))
}

fn remove(path_str: String, options: Option<RmOptions>) -> Result<()> {
  let path = Path::new(&path_str);

  let opts = options.unwrap_or(RmOptions {
    force: Some(false),
    recursive: Some(false),
    max_retries: None,
    retry_delay: None,
    concurrency: None,
  });
  let force = opts.force.unwrap_or(false);

  match fs::symlink_metadata(path) {
    Ok(_) => {}
    Err(error) if error.kind() == io::ErrorKind::NotFound && force => return Ok(()),
    Err(error) => return Err(remove_error(path, error)),
  }

  remove_with_retry(path, &opts).map_err(|error| remove_error(path, error))
}

// ========= async version =========

pub struct RmTask {
  pub path: String,
  pub options: Option<RmOptions>,
}

impl Task for RmTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    remove(self.path.clone(), self.options.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "rm", ts_return_type = "Promise<void>")]
pub fn rm(path: String, options: Option<RmOptions>) -> AsyncTask<RmTask> {
  AsyncTask::new(RmTask { path, options })
}

#[napi(js_name = "rmSync")]
pub fn rm_sync(path: String, options: Option<RmOptions>) -> Result<()> {
  remove(path, options)
}
