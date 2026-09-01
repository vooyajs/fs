use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

#[napi(js_name = "existsSync")]
pub fn exists_sync(path: String) -> bool {
  Path::new(&path).exists()
}

// ========= async version =========

pub struct ExistsTask {
  pub path: String,
}

impl Task for ExistsTask {
  type Output = bool;
  type JsValue = bool;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(Path::new(&self.path).exists())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "exists", ts_return_type = "Promise<boolean>")]
pub fn exists(path: String) -> AsyncTask<ExistsTask> {
  AsyncTask::new(ExistsTask { path })
}
