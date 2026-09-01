use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

fn readlink_impl(path_str: String) -> Result<String> {
  let path = Path::new(&path_str);
  let target = fs::read_link(path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, readlink '{}'",
        path.to_string_lossy()
      ))
    } else {
      Error::from_reason(format!(
        "EINVAL: invalid argument, readlink '{}'",
        path.to_string_lossy()
      ))
    }
  })?;
  Ok(target.to_string_lossy().to_string())
}

#[napi(js_name = "readlinkSync")]
pub fn readlink_sync(path: String) -> Result<String> {
  readlink_impl(path)
}

// ========= async version =========

pub struct ReadlinkTask {
  pub path: String,
}

impl Task for ReadlinkTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    readlink_impl(self.path.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "readlink", ts_return_type = "Promise<string>")]
pub fn readlink(path: String) -> AsyncTask<ReadlinkTask> {
  AsyncTask::new(ReadlinkTask { path })
}
