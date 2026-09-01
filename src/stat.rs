use crate::types::Stats;
use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

fn secs_nanos_to_ms(secs: i64, nsecs: i64) -> f64 {
  (secs as f64) * 1000.0 + (nsecs as f64) / 1_000_000.0
}

fn system_time_to_ms(t: std::time::SystemTime) -> f64 {
  use std::time::UNIX_EPOCH;
  match t.duration_since(UNIX_EPOCH) {
    Ok(d) => d.as_secs_f64() * 1000.0,
    Err(e) => -(e.duration().as_secs_f64() * 1000.0),
  }
}

fn metadata_to_stats(meta: &fs::Metadata) -> Stats {
  #[cfg(unix)]
  {
    let atime_ms = secs_nanos_to_ms(meta.atime(), meta.atime_nsec());
    let mtime_ms = secs_nanos_to_ms(meta.mtime(), meta.mtime_nsec());
    let ctime_ms = secs_nanos_to_ms(meta.ctime(), meta.ctime_nsec());
    let birthtime_ms = meta
      .created()
      .ok()
      .map(system_time_to_ms)
      .unwrap_or(ctime_ms);

    Stats {
      dev: meta.dev() as f64,
      mode: meta.mode(),
      nlink: meta.nlink() as f64,
      uid: meta.uid(),
      gid: meta.gid(),
      rdev: meta.rdev() as f64,
      blksize: meta.blksize() as f64,
      ino: meta.ino() as f64,
      size: meta.size() as f64,
      blocks: meta.blocks() as f64,
      atime_ms,
      mtime_ms,
      ctime_ms,
      birthtime_ms,
    }
  }

  #[cfg(not(unix))]
  {
    let to_ms = |t: std::io::Result<std::time::SystemTime>| -> f64 {
      t.ok().map(system_time_to_ms).unwrap_or(0.0)
    };
    let atime_ms = to_ms(meta.accessed());
    let mtime_ms = to_ms(meta.modified());
    let birthtime_ms = to_ms(meta.created());

    // Match node:fs on Windows: include basic permission bits.
    let mode = if meta.is_dir() {
      0o040000u32 | 0o777
    } else if meta.is_symlink() {
      0o120000u32 | 0o777
    } else {
      0o100000u32 | 0o666
    };

    Stats {
      dev: 0.0,
      mode,
      nlink: 1.0,
      uid: 0,
      gid: 0,
      rdev: 0.0,
      blksize: 4096.0,
      ino: 0.0,
      size: meta.len() as f64,
      blocks: 0.0,
      atime_ms,
      mtime_ms,
      ctime_ms: mtime_ms,
      birthtime_ms,
    }
  }
}

fn stat_impl(path_str: String, follow_symlinks: bool) -> Result<Stats> {
  let path = Path::new(&path_str);
  let meta_result = if follow_symlinks {
    fs::metadata(path)
  } else {
    fs::symlink_metadata(path)
  };

  let meta = match meta_result {
    Ok(meta) => meta,
    Err(err) => {
      #[cfg(windows)]
      {
        if follow_symlinks && err.kind() == ErrorKind::PermissionDenied {
          if let Some(target_meta) = follow_windows_symlink_target(path) {
            target_meta
          } else {
            return Err(stat_error(path, err));
          }
        } else {
          return Err(stat_error(path, err));
        }
      }
      #[cfg(not(windows))]
      {
        return Err(stat_error(path, err));
      }
    }
  };

  Ok(metadata_to_stats(&meta))
}

fn stat_error(path: &Path, err: std::io::Error) -> Error {
  if err.kind() == ErrorKind::PermissionDenied {
    Error::from_reason(format!(
      "EACCES: permission denied, stat '{}'",
      path.to_string_lossy()
    ))
  } else {
    Error::from_reason(format!(
      "ENOENT: no such file or directory, stat '{}'",
      path.to_string_lossy()
    ))
  }
}

#[cfg(windows)]
fn follow_windows_symlink_target(path: &Path) -> Option<fs::Metadata> {
  let link_meta = fs::symlink_metadata(path).ok()?;
  if !link_meta.file_type().is_symlink() {
    return None;
  }

  let target = fs::read_link(path).ok()?;
  let resolved = if target.is_absolute() {
    target
  } else {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    parent.join(target)
  };
  fs::metadata(&resolved).ok()
}

#[napi(js_name = "statSync")]
pub fn stat_sync(path: String) -> Result<Stats> {
  stat_impl(path, true)
}

#[napi(js_name = "lstatSync")]
pub fn lstat_sync(path: String) -> Result<Stats> {
  stat_impl(path, false)
}

// ========= async versions =========

pub struct StatTask {
  pub path: String,
  pub follow_symlinks: bool,
}

impl Task for StatTask {
  type Output = Stats;
  type JsValue = Stats;

  fn compute(&mut self) -> Result<Self::Output> {
    stat_impl(self.path.clone(), self.follow_symlinks)
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "stat", ts_return_type = "Promise<Stats>")]
pub fn stat(path: String) -> AsyncTask<StatTask> {
  AsyncTask::new(StatTask {
    path,
    follow_symlinks: true,
  })
}

#[napi(js_name = "lstat", ts_return_type = "Promise<Stats>")]
pub fn lstat(path: String) -> AsyncTask<StatTask> {
  AsyncTask::new(StatTask {
    path,
    follow_symlinks: false,
  })
}
