use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

fn unlink_impl(path_str: String) -> Result<()> {
  let path = Path::new(&path_str);

  // Node.js unlink only removes files and symlinks, not directories
  let meta = fs::symlink_metadata(path).map_err(|_| {
    Error::from_reason(format!(
      "ENOENT: no such file or directory, unlink '{}'",
      path.to_string_lossy()
    ))
  })?;

  if meta.is_dir() {
    return Err(Error::from_reason(format!(
      "EPERM: operation not permitted, unlink '{}'",
      path.to_string_lossy()
    )));
  }

  fs::remove_file(path).map_err(|e| Error::from_reason(e.to_string()))?;
  Ok(())
}

#[napi(js_name = "unlinkSync")]
pub fn unlink_sync(path: String) -> Result<()> {
  unlink_impl(path)
}

// ========= async version =========

pub struct UnlinkTask {
  pub path: String,
}

impl Task for UnlinkTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    unlink_impl(self.path.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "unlink", ts_return_type = "Promise<void>")]
pub fn unlink(path: String) -> AsyncTask<UnlinkTask> {
  AsyncTask::new(UnlinkTask { path })
}
