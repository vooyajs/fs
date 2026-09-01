use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

fn rmdir_impl(path_str: String) -> Result<()> {
  let path = Path::new(&path_str);

  fs::remove_dir(path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, rmdir '{}'",
        path.to_string_lossy()
      ))
    } else if e.to_string().contains("not empty") || e.kind() == std::io::ErrorKind::AlreadyExists {
      Error::from_reason(format!(
        "ENOTEMPTY: directory not empty, rmdir '{}'",
        path.to_string_lossy()
      ))
    } else if e.to_string().contains("Not a directory") {
      Error::from_reason(format!(
        "ENOTDIR: not a directory, rmdir '{}'",
        path.to_string_lossy()
      ))
    } else {
      Error::from_reason(e.to_string())
    }
  })
}

#[napi(js_name = "rmdirSync")]
pub fn rmdir_sync(path: String) -> Result<()> {
  rmdir_impl(path)
}

// ========= async version =========

pub struct RmdirTask {
  pub path: String,
}

impl Task for RmdirTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    rmdir_impl(self.path.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "rmdir", ts_return_type = "Promise<void>")]
pub fn rmdir(path: String) -> AsyncTask<RmdirTask> {
  AsyncTask::new(RmdirTask { path })
}
