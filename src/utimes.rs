use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::path::Path;

#[cfg(not(any(unix, windows)))]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(not(any(unix, windows)))]
fn to_system_time(time_secs: f64) -> SystemTime {
  if time_secs >= 0.0 {
    UNIX_EPOCH + Duration::from_secs_f64(time_secs)
  } else {
    UNIX_EPOCH - Duration::from_secs_f64(-time_secs)
  }
}

fn utimes_impl(path_str: String, atime: f64, mtime: f64) -> Result<()> {
  let path = Path::new(&path_str);

  if !path.exists() {
    return Err(Error::from_reason(format!(
      "ENOENT: no such file or directory, utimes '{}'",
      path.to_string_lossy()
    )));
  }

  #[cfg(unix)]
  {
    use std::ffi::CString;

    let c_path = CString::new(path.to_string_lossy().as_bytes())
      .map_err(|_| Error::from_reason("Invalid path"))?;

    let atime_sec = atime as i64;
    let atime_nsec = ((atime - atime as i64 as f64) * 1_000_000_000.0) as i64;
    let mtime_sec = mtime as i64;
    let mtime_nsec = ((mtime - mtime as i64 as f64) * 1_000_000_000.0) as i64;

    let times = [
      libc::timespec {
        tv_sec: atime_sec,
        tv_nsec: atime_nsec,
      },
      libc::timespec {
        tv_sec: mtime_sec,
        tv_nsec: mtime_nsec,
      },
    ];

    let ret = unsafe { libc::utimensat(libc::AT_FDCWD, c_path.as_ptr(), times.as_ptr(), 0) };
    if ret != 0 {
      let e = std::io::Error::last_os_error();
      return Err(Error::from_reason(format!(
        "{}, utimes '{}'",
        e,
        path.to_string_lossy()
      )));
    }
  }

  #[cfg(windows)]
  {
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
      CreateFileW, SetFileTime, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_BACKUP_SEMANTICS,
      FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_WRITE_ATTRIBUTES, OPEN_EXISTING,
    };

    fn secs_to_filetime(time_secs: f64) -> FILETIME {
      // FILETIME is 100ns ticks since 1601-01-01 UTC.
      const EPOCH_DIFF_SECS: f64 = 11_644_473_600.0;
      let windows_secs = time_secs + EPOCH_DIFF_SECS;
      let ticks_100ns = (windows_secs * 10_000_000.0).round() as i128;
      FILETIME {
        dwLowDateTime: (ticks_100ns & 0xFFFF_FFFF) as u32,
        dwHighDateTime: ((ticks_100ns >> 32) & 0xFFFF_FFFF) as u32,
      }
    }

    let mut flags = FILE_ATTRIBUTE_NORMAL;
    if path.is_dir() {
      // Directories require FILE_FLAG_BACKUP_SEMANTICS.
      flags |= FILE_FLAG_BACKUP_SEMANTICS;
    }

    let wide: Vec<u16> = path
      .as_os_str()
      .encode_wide()
      .chain(std::iter::once(0))
      .collect();
    let handle: HANDLE = unsafe {
      CreateFileW(
        wide.as_ptr(),
        FILE_WRITE_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        std::ptr::null(),
        OPEN_EXISTING,
        flags,
        std::ptr::null_mut(),
      )
    };
    if handle == INVALID_HANDLE_VALUE {
      let e = std::io::Error::last_os_error();
      return Err(Error::from_reason(format!(
        "{}, utimes '{}'",
        e,
        path.to_string_lossy()
      )));
    }

    let atime_ft = secs_to_filetime(atime);
    let mtime_ft = secs_to_filetime(mtime);
    let ok = unsafe {
      SetFileTime(
        handle,
        std::ptr::null(),
        &atime_ft as *const FILETIME,
        &mtime_ft as *const FILETIME,
      )
    };
    unsafe {
      CloseHandle(handle);
    }
    if ok == 0 {
      let e = std::io::Error::last_os_error();
      return Err(Error::from_reason(format!(
        "{}, utimes '{}'",
        e,
        path.to_string_lossy()
      )));
    }
  }

  #[cfg(not(any(unix, windows)))]
  {
    use std::fs;
    let atime_sys = to_system_time(atime);
    let mtime_sys = to_system_time(mtime);
    let file = fs::OpenOptions::new()
      .write(true)
      .open(path)
      .map_err(|e| Error::from_reason(e.to_string()))?;
    file
      .set_modified(mtime_sys)
      .map_err(|e| Error::from_reason(e.to_string()))?;
    let _ = atime_sys;
  }

  Ok(())
}

#[napi(js_name = "utimesSync")]
pub fn utimes_sync(path: String, atime: f64, mtime: f64) -> Result<()> {
  utimes_impl(path, atime, mtime)
}

// ========= async version =========

pub struct UtimesTask {
  pub path: String,
  pub atime: f64,
  pub mtime: f64,
}

impl Task for UtimesTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    utimes_impl(self.path.clone(), self.atime, self.mtime)
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "utimes", ts_return_type = "Promise<void>")]
pub fn utimes(path: String, atime: f64, mtime: f64) -> AsyncTask<UtimesTask> {
  AsyncTask::new(UtimesTask { path, atime, mtime })
}
