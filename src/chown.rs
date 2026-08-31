use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

fn chown_impl(path_str: String, uid: u32, gid: u32) -> Result<()> {
  let path = Path::new(&path_str);

  #[cfg(unix)]
  {
    use std::ffi::CString;
    let c_path = CString::new(path.to_string_lossy().as_bytes())
      .map_err(|_| Error::from_reason("Invalid path"))?;
    let ret = unsafe { libc::chown(c_path.as_ptr(), uid, gid) };
    if ret != 0 {
      let e = std::io::Error::last_os_error();
      if e.kind() == std::io::ErrorKind::NotFound {
        return Err(Error::from_reason(format!(
          "ENOENT: no such file or directory, chown '{}'",
          path.to_string_lossy()
        )));
      }
      return Err(Error::from_reason(format!(
        "EPERM: operation not permitted, chown '{}'",
        path.to_string_lossy()
      )));
    }
  }

  #[cfg(not(unix))]
  {
    let _ = (uid, gid);
    if !path.exists() {
      return Err(Error::from_reason(format!(
        "ENOENT: no such file or directory, chown '{}'",
        path.to_string_lossy()
      )));
    }
  }

  Ok(())
}

#[napi(js_name = "chownSync")]
pub fn chown_sync(path: String, uid: u32, gid: u32) -> Result<()> {
  chown_impl(path, uid, gid)
}

// ========= async version =========

pub struct ChownTask {
  pub path: String,
  pub uid: u32,
  pub gid: u32,
}

impl Task for ChownTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    chown_impl(self.path.clone(), self.uid, self.gid)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "chown", ts_return_type = "Promise<void>")]
pub fn chown(path: String, uid: u32, gid: u32) -> AsyncTask<ChownTask> {
  AsyncTask::new(ChownTask { path, uid, gid })
}
