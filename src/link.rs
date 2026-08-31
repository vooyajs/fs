use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

fn link_impl(existing_path: String, new_path: String) -> Result<()> {
  let existing = Path::new(&existing_path);
  let new = Path::new(&new_path);

  fs::hard_link(existing, new).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, link '{}' -> '{}'",
        existing_path, new_path
      ))
    } else if e.kind() == std::io::ErrorKind::AlreadyExists {
      Error::from_reason(format!(
        "EEXIST: file already exists, link '{}' -> '{}'",
        existing_path, new_path
      ))
    } else if e.kind() == std::io::ErrorKind::PermissionDenied {
      Error::from_reason(format!(
        "EPERM: operation not permitted, link '{}' -> '{}'",
        existing_path, new_path
      ))
    } else {
      Error::from_reason(format!("{}, link '{}' -> '{}'", e, existing_path, new_path))
    }
  })?;
  Ok(())
}

#[napi(js_name = "linkSync")]
pub fn link_sync(existing_path: String, new_path: String) -> Result<()> {
  link_impl(existing_path, new_path)
}

// ========= async version =========

pub struct LinkTask {
  pub existing_path: String,
  pub new_path: String,
}

impl Task for LinkTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    link_impl(self.existing_path.clone(), self.new_path.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "link", ts_return_type = "Promise<void>")]
pub fn link(existing_path: String, new_path: String) -> AsyncTask<LinkTask> {
  AsyncTask::new(LinkTask {
    existing_path,
    new_path,
  })
}
