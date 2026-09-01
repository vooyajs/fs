use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

#[napi(object)]
#[derive(Clone)]
pub struct MkdirOptions {
  pub recursive: Option<bool>,
  pub mode: Option<u32>,
}

fn mkdir_impl(path_str: String, options: Option<MkdirOptions>) -> Result<Option<String>> {
  let path = Path::new(&path_str);
  let opts = options.unwrap_or(MkdirOptions {
    recursive: None,
    mode: None,
  });
  let recursive = opts.recursive.unwrap_or(false);

  let mode = opts.mode.unwrap_or(0o777);

  if recursive {
    // Node.js returns the first directory path created, or undefined if it already existed
    if path.exists() {
      if path.is_dir() {
        return Ok(None);
      }
      return Err(Error::from_reason(format!(
        "EEXIST: file already exists, mkdir '{}'",
        path.to_string_lossy()
      )));
    }

    // Find the first ancestor that doesn't exist
    let mut ancestors = vec![];
    let mut current = path.to_path_buf();
    while !current.exists() {
      ancestors.push(current.clone());
      match current.parent() {
        Some(parent) => current = parent.to_path_buf(),
        None => break,
      }
    }

    if current.exists() && !current.is_dir() {
      return Err(Error::from_reason(format!(
        "ENOTDIR: not a directory, mkdir '{}'",
        path.to_string_lossy()
      )));
    }

    create_dir(path, true, mode).map_err(|e| mkdir_error(path, e))?;

    let first_created = ancestors.last().map(|p| p.to_string_lossy().to_string());
    Ok(first_created)
  } else {
    create_dir(path, false, mode).map_err(|e| mkdir_error(path, e))?;

    Ok(None)
  }
}

fn create_dir(path: &Path, recursive: bool, mode: u32) -> std::io::Result<()> {
  let mut builder = fs::DirBuilder::new();
  builder.recursive(recursive);
  #[cfg(unix)]
  {
    use std::os::unix::fs::DirBuilderExt;
    builder.mode(mode);
  }
  #[cfg(not(unix))]
  let _ = mode;
  builder.create(path)
}

fn mkdir_error(path: &Path, err: std::io::Error) -> Error {
  let path_display = path.to_string_lossy();
  if err.to_string().contains("Not a directory") {
    return Error::from_reason(format!(
      "ENOTDIR: not a directory, mkdir '{}'",
      path_display
    ));
  }
  match err.kind() {
    ErrorKind::NotFound => Error::from_reason(format!(
      "ENOENT: no such file or directory, mkdir '{}'",
      path_display
    )),
    ErrorKind::AlreadyExists => Error::from_reason(format!(
      "EEXIST: file already exists, mkdir '{}'",
      path_display
    )),
    ErrorKind::PermissionDenied => Error::from_reason(format!(
      "EACCES: permission denied, mkdir '{}'",
      path_display
    )),
    _ => Error::from_reason(format!("{}, mkdir '{}'", err, path_display)),
  }
}

#[napi(js_name = "mkdirSync")]
pub fn mkdir_sync(
  path: String,
  options: Option<MkdirOptions>,
) -> Result<Either<String, Undefined>> {
  mkdir_impl(path, options).map(Either::from)
}

// ========= async version =========

pub struct MkdirTask {
  pub path: String,
  pub options: Option<MkdirOptions>,
}

impl Task for MkdirTask {
  type Output = Option<String>;
  type JsValue = Either<String, Undefined>;

  fn compute(&mut self) -> Result<Self::Output> {
    mkdir_impl(self.path.clone(), self.options.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(Either::from(output))
  }
}

#[napi(js_name = "mkdir", ts_return_type = "Promise<string | undefined>")]
pub fn mkdir(path: String, options: Option<MkdirOptions>) -> AsyncTask<MkdirTask> {
  AsyncTask::new(MkdirTask { path, options })
}
