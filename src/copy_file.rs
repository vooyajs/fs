use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

// Node.js copyFile mode constants
pub const COPYFILE_EXCL: u32 = 1;
pub const COPYFILE_FICLONE: u32 = 2;
pub const COPYFILE_FICLONE_FORCE: u32 = 4;

fn copy_file_impl(src_str: String, dest_str: String, mode: Option<u32>) -> Result<()> {
  let src = Path::new(&src_str);
  let dest = Path::new(&dest_str);
  let mode = mode.unwrap_or(0);

  if mode & COPYFILE_EXCL != 0 && dest.exists() {
    return Err(Error::from_reason(format!(
      "EEXIST: file already exists, copyfile '{}' -> '{}'",
      src.to_string_lossy(),
      dest.to_string_lossy()
    )));
  }

  fs::copy(src, dest).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, copyfile '{}' -> '{}'",
        src.to_string_lossy(),
        dest.to_string_lossy()
      ))
    } else {
      Error::from_reason(format!(
        "{}, copyfile '{}' -> '{}'",
        e,
        src.to_string_lossy(),
        dest.to_string_lossy()
      ))
    }
  })?;

  Ok(())
}

#[napi(js_name = "copyFileSync")]
pub fn copy_file_sync(src: String, dest: String, mode: Option<u32>) -> Result<()> {
  copy_file_impl(src, dest, mode)
}

// ========= async version =========

pub struct CopyFileTask {
  pub src: String,
  pub dest: String,
  pub mode: Option<u32>,
}

impl Task for CopyFileTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    copy_file_impl(self.src.clone(), self.dest.clone(), self.mode)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "copyFile", ts_return_type = "Promise<void>")]
pub fn copy_file(src: String, dest: String, mode: Option<u32>) -> AsyncTask<CopyFileTask> {
  AsyncTask::new(CopyFileTask { src, dest, mode })
}
