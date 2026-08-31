use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs::OpenOptions;
use std::path::Path;

fn truncate_impl(path_str: String, len: Option<i64>) -> Result<()> {
  let path = Path::new(&path_str);
  // Node 24 clamps negative path-based truncate lengths to zero.
  let len = len.unwrap_or(0).max(0) as u64;

  let file = OpenOptions::new().write(true).open(path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, open '{}'",
        path.to_string_lossy()
      ))
    } else {
      Error::from_reason(e.to_string())
    }
  })?;

  file
    .set_len(len)
    .map_err(|e| Error::from_reason(e.to_string()))?;
  Ok(())
}

#[napi(js_name = "truncateSync")]
pub fn truncate_sync(path: String, len: Option<i64>) -> Result<()> {
  truncate_impl(path, len)
}

// ========= async version =========

pub struct TruncateTask {
  pub path: String,
  pub len: Option<i64>,
}

impl Task for TruncateTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    truncate_impl(self.path.clone(), self.len)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "truncate", ts_return_type = "Promise<void>")]
pub fn truncate(path: String, len: Option<i64>) -> AsyncTask<TruncateTask> {
  AsyncTask::new(TruncateTask { path, len })
}
