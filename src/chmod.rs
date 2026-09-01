use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

fn chmod_impl(path_str: String, mode: u32) -> Result<()> {
  let path = Path::new(&path_str);

  #[cfg(unix)]
  {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    let permissions = fs::Permissions::from_mode(mode);
    fs::set_permissions(path, permissions).map_err(|e| {
      if e.kind() == std::io::ErrorKind::NotFound {
        Error::from_reason(format!(
          "ENOENT: no such file or directory, chmod '{}'",
          path.to_string_lossy()
        ))
      } else {
        Error::from_reason(e.to_string())
      }
    })?;
  }

  #[cfg(not(unix))]
  {
    let _ = mode;
    if !path.exists() {
      return Err(Error::from_reason(format!(
        "ENOENT: no such file or directory, chmod '{}'",
        path.to_string_lossy()
      )));
    }
  }

  Ok(())
}

#[napi(js_name = "chmodSync")]
pub fn chmod_sync(path: String, mode: u32) -> Result<()> {
  chmod_impl(path, mode)
}

// ========= async version =========

pub struct ChmodTask {
  pub path: String,
  pub mode: u32,
}

impl Task for ChmodTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    chmod_impl(self.path.clone(), self.mode)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "chmod", ts_return_type = "Promise<void>")]
pub fn chmod(path: String, mode: u32) -> AsyncTask<ChmodTask> {
  AsyncTask::new(ChmodTask { path, mode })
}
