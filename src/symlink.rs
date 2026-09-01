use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

/// On Windows, `symlink_type` controls whether a file or directory symlink
/// (or junction) is created. Valid values: 'file' | 'dir' | 'junction'.
/// On Unix this parameter is ignored.
fn symlink_impl(target: String, path_str: String, symlink_type: Option<String>) -> Result<()> {
  let path = Path::new(&path_str);
  let target_path = Path::new(&target);

  if path.exists() || path.symlink_metadata().is_ok() {
    return Err(Error::from_reason(format!(
      "EEXIST: file already exists, symlink '{}' -> '{}'",
      target, path_str
    )));
  }

  #[cfg(unix)]
  {
    let _ = symlink_type; // unused on Unix
    std::os::unix::fs::symlink(target_path, path).map_err(|e| {
      if e.kind() == std::io::ErrorKind::NotFound {
        Error::from_reason(format!(
          "ENOENT: no such file or directory, symlink '{}' -> '{}'",
          target, path_str
        ))
      } else {
        Error::from_reason(format!("{}, symlink '{}' -> '{}'", e, target, path_str))
      }
    })?;
  }

  #[cfg(windows)]
  {
    let inferred = || {
      if target_path.is_dir() {
        "dir"
      } else {
        "file"
      }
    };
    let ty = symlink_type.as_deref().unwrap_or_else(inferred);
    match ty {
      "junction" => {
        // Junction only works for directories; use symlink_dir as fallback
        std::os::windows::fs::symlink_dir(target_path, path)
      }
      "dir" => std::os::windows::fs::symlink_dir(target_path, path),
      _ => std::os::windows::fs::symlink_file(target_path, path),
    }
    .map_err(|e| {
      if e.kind() == std::io::ErrorKind::NotFound {
        Error::from_reason(format!(
          "ENOENT: no such file or directory, symlink '{}' -> '{}'",
          target, path_str
        ))
      } else {
        Error::from_reason(format!("{}, symlink '{}' -> '{}'", e, target, path_str))
      }
    })?;
  }

  Ok(())
}

#[napi(js_name = "symlinkSync")]
pub fn symlink_sync(target: String, path: String, symlink_type: Option<String>) -> Result<()> {
  symlink_impl(target, path, symlink_type)
}

// ========= async version =========

pub struct SymlinkTask {
  pub target: String,
  pub path: String,
  pub symlink_type: Option<String>,
}

impl Task for SymlinkTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    symlink_impl(
      self.target.clone(),
      self.path.clone(),
      self.symlink_type.clone(),
    )
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "symlink", ts_return_type = "Promise<void>")]
pub fn symlink(
  target: String,
  path: String,
  symlink_type: Option<String>,
) -> AsyncTask<SymlinkTask> {
  AsyncTask::new(SymlinkTask {
    target,
    path,
    symlink_type,
  })
}
