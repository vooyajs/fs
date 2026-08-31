use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use std::fs;
use std::path::Path;

#[napi(object)]
#[derive(Clone)]
pub struct CpOptions {
  pub recursive: Option<bool>,
  pub force: Option<bool>,
  pub error_on_exist: Option<bool>,
  pub preserve_timestamps: Option<bool>,
  pub dereference: Option<bool>,
  pub verbatim_symlinks: Option<bool>,
  /// Vooya FS extension: number of parallel threads for recursive copy.
  /// 0 or 1 means sequential; > 1 enables rayon parallel traversal.
  pub concurrency: Option<u32>,
}

#[cfg(unix)]
fn set_timestamps(src: &Path, dest: &Path) -> std::io::Result<()> {
  use std::os::unix::fs::MetadataExt;
  let src_meta = fs::metadata(src)?;
  let atime_secs = src_meta.atime();
  let atime_nsecs = src_meta.atime_nsec();
  let mtime_secs = src_meta.mtime();
  let mtime_nsecs = src_meta.mtime_nsec();

  unsafe {
    let c_path = std::ffi::CString::new(dest.to_string_lossy().as_bytes())
      .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid path"))?;
    let times = [
      libc::timespec {
        tv_sec: atime_secs,
        tv_nsec: atime_nsecs,
      },
      libc::timespec {
        tv_sec: mtime_secs,
        tv_nsec: mtime_nsecs,
      },
    ];
    let result = libc::utimensat(libc::AT_FDCWD, c_path.as_ptr(), times.as_ptr(), 0);
    if result != 0 {
      return Err(std::io::Error::last_os_error());
    }
  }
  Ok(())
}

#[cfg(not(unix))]
fn set_timestamps(_src: &Path, _dest: &Path) -> std::io::Result<()> {
  Ok(())
}

fn cp_impl(src: &Path, dest: &Path, opts: &CpOptions, parallel: bool) -> Result<()> {
  let force = opts.force.unwrap_or(true);
  let error_on_exist = opts.error_on_exist.unwrap_or(false);
  let recursive = opts.recursive.unwrap_or(false);
  let preserve_timestamps = opts.preserve_timestamps.unwrap_or(false);
  let dereference = opts.dereference.unwrap_or(false);
  let verbatim_symlinks = opts.verbatim_symlinks.unwrap_or(false);

  let meta = if dereference {
    fs::metadata(src)
  } else {
    fs::symlink_metadata(src)
  };

  let meta = meta.map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, cp '{}' -> '{}'",
        src.to_string_lossy(),
        dest.to_string_lossy()
      ))
    } else {
      Error::from_reason(e.to_string())
    }
  })?;

  if meta.is_symlink() && !dereference {
    let target = fs::read_link(src).map_err(|e| Error::from_reason(e.to_string()))?;

    let link_target = if verbatim_symlinks {
      target
    } else if target.is_relative() {
      src
        .parent()
        .unwrap_or(Path::new(""))
        .join(&target)
        .canonicalize()
        .unwrap_or(target)
    } else {
      target.canonicalize().unwrap_or(target)
    };

    if dest.exists() || dest.symlink_metadata().is_ok() {
      if error_on_exist {
        return Err(Error::from_reason(format!(
          "EEXIST: file already exists, cp '{}' -> '{}'",
          src.to_string_lossy(),
          dest.to_string_lossy()
        )));
      }
      if force {
        let _ = fs::remove_file(dest);
      } else {
        return Ok(());
      }
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&link_target, dest)
      .map_err(|e| Error::from_reason(e.to_string()))?;
    #[cfg(windows)]
    {
      if link_target.is_dir() {
        std::os::windows::fs::symlink_dir(&link_target, dest)
          .map_err(|e| Error::from_reason(e.to_string()))?;
      } else {
        std::os::windows::fs::symlink_file(&link_target, dest)
          .map_err(|e| Error::from_reason(e.to_string()))?;
      }
    }
    return Ok(());
  }

  if meta.is_dir() {
    if !recursive {
      return Err(Error::from_reason(format!(
        "ERR_FS_EISDIR: Path is a directory. To copy a directory set the 'recursive' option to true, cp '{}' -> '{}'",
        src.to_string_lossy(),
        dest.to_string_lossy()
      )));
    }

    if !dest.exists() {
      fs::create_dir_all(dest).map_err(|e| Error::from_reason(e.to_string()))?;
    }

    let entries: Vec<_> = fs::read_dir(src)
      .map_err(|e| Error::from_reason(e.to_string()))?
      .collect::<std::io::Result<_>>()
      .map_err(|e| Error::from_reason(e.to_string()))?;

    if parallel {
      entries.par_iter().try_for_each(|entry| -> Result<()> {
        cp_impl(&entry.path(), &dest.join(entry.file_name()), opts, true)
      })?;
    } else {
      for entry in &entries {
        cp_impl(&entry.path(), &dest.join(entry.file_name()), opts, false)?;
      }
    }

    if preserve_timestamps {
      set_timestamps(src, dest).map_err(|e| Error::from_reason(e.to_string()))?;
    }
  } else {
    if dest.exists() {
      if error_on_exist {
        return Err(Error::from_reason(format!(
          "EEXIST: file already exists, cp '{}' -> '{}'",
          src.to_string_lossy(),
          dest.to_string_lossy()
        )));
      }
      if !force {
        return Ok(());
      }
    }

    if let Some(parent) = dest.parent() {
      if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| Error::from_reason(e.to_string()))?;
      }
    }

    fs::copy(src, dest).map_err(|e| Error::from_reason(e.to_string()))?;

    if preserve_timestamps {
      set_timestamps(src, dest).map_err(|e| Error::from_reason(e.to_string()))?;
    }
  }

  Ok(())
}

fn cp_entry(src_str: String, dest_str: String, options: Option<CpOptions>) -> Result<()> {
  let src = Path::new(&src_str);
  let dest = Path::new(&dest_str);
  let opts = options.unwrap_or(CpOptions {
    recursive: None,
    force: None,
    error_on_exist: None,
    preserve_timestamps: None,
    dereference: None,
    verbatim_symlinks: None,
    concurrency: None,
  });
  let concurrency = opts.concurrency.unwrap_or(1);
  if concurrency > 1 {
    let pool = ThreadPoolBuilder::new()
      .num_threads(concurrency as usize)
      .build()
      .map_err(|e| Error::from_reason(format!("failed to create copy worker pool: {}", e)))?;
    pool.install(|| cp_impl(src, dest, &opts, true))
  } else {
    cp_impl(src, dest, &opts, false)
  }
}

#[napi(js_name = "cpSync")]
pub fn cp_sync(src: String, dest: String, options: Option<CpOptions>) -> Result<()> {
  cp_entry(src, dest, options)
}

// ========= async version =========

pub struct CpTask {
  pub src: String,
  pub dest: String,
  pub options: Option<CpOptions>,
}

impl Task for CpTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    cp_entry(self.src.clone(), self.dest.clone(), self.options.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "cp", ts_return_type = "Promise<void>")]
pub fn cp(src: String, dest: String, options: Option<CpOptions>) -> AsyncTask<CpTask> {
  AsyncTask::new(CpTask { src, dest, options })
}
