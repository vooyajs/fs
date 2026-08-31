use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

// Node.js access mode constants
pub const F_OK: u32 = 0;
pub const R_OK: u32 = 4;
pub const W_OK: u32 = 2;
pub const X_OK: u32 = 1;

fn access_impl(path_str: String, mode: Option<u32>) -> Result<()> {
  let path = Path::new(&path_str);
  let mode = mode.unwrap_or(F_OK);

  #[cfg(unix)]
  {
    use std::ffi::CString;

    let c_path = CString::new(path.as_os_str().as_encoded_bytes())
      .map_err(|_| Error::from_reason("EINVAL: path contains a null byte"))?;
    if unsafe { libc::access(c_path.as_ptr(), mode as i32) } != 0 {
      let error = std::io::Error::last_os_error();
      let code = if error.kind() == std::io::ErrorKind::NotFound {
        "ENOENT: no such file or directory"
      } else if error.kind() == std::io::ErrorKind::PermissionDenied {
        "EACCES: permission denied"
      } else {
        return Err(Error::from_reason(format!(
          "{}, access '{}'",
          error,
          path.to_string_lossy()
        )));
      };
      return Err(Error::from_reason(format!(
        "{}, access '{}'",
        code,
        path.to_string_lossy()
      )));
    }
  }

  #[cfg(not(unix))]
  {
    let meta = std::fs::symlink_metadata(path).map_err(|_| {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, access '{}'",
        path.to_string_lossy()
      ))
    })?;
    if mode & W_OK != 0 && meta.permissions().readonly() {
      return Err(Error::from_reason(format!(
        "EACCES: permission denied, access '{}'",
        path.to_string_lossy()
      )));
    }
  }

  Ok(())
}

#[napi(js_name = "accessSync")]
pub fn access_sync(path: String, mode: Option<u32>) -> Result<()> {
  access_impl(path, mode)
}

// ========= async version =========

pub struct AccessTask {
  pub path: String,
  pub mode: Option<u32>,
}

impl Task for AccessTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    access_impl(self.path.clone(), self.mode)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "access", ts_return_type = "Promise<void>")]
pub fn access(path: String, mode: Option<u32>) -> AsyncTask<AccessTask> {
  AsyncTask::new(AccessTask { path, mode })
}
