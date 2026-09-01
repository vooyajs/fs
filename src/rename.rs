use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

fn rename_impl(old_path_str: String, new_path_str: String) -> Result<()> {
  let old_path = Path::new(&old_path_str);
  let new_path = Path::new(&new_path_str);

  fs::rename(old_path, new_path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, rename '{}' -> '{}'",
        old_path.to_string_lossy(),
        new_path.to_string_lossy()
      ))
    } else {
      Error::from_reason(format!(
        "{}, rename '{}' -> '{}'",
        e,
        old_path.to_string_lossy(),
        new_path.to_string_lossy()
      ))
    }
  })?;
  Ok(())
}

#[napi(js_name = "renameSync")]
pub fn rename_sync(old_path: String, new_path: String) -> Result<()> {
  rename_impl(old_path, new_path)
}

// ========= async version =========

pub struct RenameTask {
  pub old_path: String,
  pub new_path: String,
}

impl Task for RenameTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    rename_impl(self.old_path.clone(), self.new_path.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "rename", ts_return_type = "Promise<void>")]
pub fn rename(old_path: String, new_path: String) -> AsyncTask<RenameTask> {
  AsyncTask::new(RenameTask { old_path, new_path })
}
