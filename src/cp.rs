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

  let meta = meta
    .map_err(|error| crate::fs_error::io(error, if dereference { "stat" } else { "lstat" }, src))?;
  let dest_meta = match fs::symlink_metadata(dest) {
    Ok(metadata) => Some(metadata),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
    Err(error) => return Err(crate::fs_error::io(error, "lstat", dest)),
  };
  if let Some(ref other) = dest_meta {
    #[cfg(unix)]
    let identical = {
      use std::os::unix::fs::MetadataExt;
      meta.ino() == other.ino() && meta.dev() == other.dev()
    };
    #[cfg(not(unix))]
    let identical = same_file::is_same_file(src, dest).unwrap_or(false);
    if identical {
      return Err(crate::fs_error::custom(
        "ERR_FS_CP_EINVAL",
        "cp",
        dest,
        None,
        "src and dest cannot be the same",
      ));
    }
    if meta.is_dir() && !other.is_dir() {
      return Err(crate::fs_error::custom(
        "ERR_FS_CP_DIR_TO_NON_DIR",
        "cp",
        dest,
        None,
        "cannot overwrite non-directory with directory",
      ));
    }
    if !meta.is_dir() && other.is_dir() {
      return Err(crate::fs_error::custom(
        "ERR_FS_CP_NON_DIR_TO_DIR",
        "cp",
        dest,
        None,
        "cannot overwrite directory with non-directory",
      ));
    }
  }

  #[cfg(unix)]
  {
    use std::os::unix::fs::FileTypeExt;
    let kind = meta.file_type();
    if kind.is_fifo() || kind.is_socket() {
      return Err(crate::fs_error::custom(
        if kind.is_fifo() {
          "ERR_FS_CP_FIFO_PIPE"
        } else {
          "ERR_FS_CP_SOCKET"
        },
        "cp",
        dest,
        None,
        "unsupported file type",
      ));
    }
  }

  if meta.is_symlink() && !dereference {
    let target = fs::read_link(src).map_err(|error| crate::fs_error::io(error, "readlink", src))?;

    let link_target = if verbatim_symlinks {
      target
    } else if target.is_relative() {
      lexical_absolute(&src.parent().unwrap_or(Path::new(".")).join(&target))?
    } else {
      target
    };

    if let Some(other) = &dest_meta {
      if other.is_symlink() {
        let target =
          fs::read_link(dest).map_err(|error| crate::fs_error::io(error, "readlink", dest))?;
        let resolved_dest =
          lexical_absolute(&dest.parent().unwrap_or(Path::new(".")).join(target))?;
        if resolved_dest.starts_with(&link_target) {
          return Err(crate::fs_error::custom(
            "ERR_FS_CP_EINVAL",
            "cp",
            dest,
            None,
            "cannot copy a symlink into itself",
          ));
        }
        let source_target =
          fs::metadata(src).map_err(|error| crate::fs_error::io(error, "stat", src))?;
        if source_target.is_dir() && link_target.starts_with(&resolved_dest) {
          return Err(crate::fs_error::custom(
            "ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY",
            "cp",
            dest,
            None,
            "cannot overwrite an ancestor symlink",
          ));
        }
        fs::remove_file(dest).map_err(|error| crate::fs_error::io(error, "unlink", dest))?;
      }
      // Existing regular destinations are left for symlink() to reject with EEXIST.
    }

    if let Some(parent) = dest.parent().filter(|p| !p.as_os_str().is_empty()) {
      fs::create_dir_all(parent).map_err(|error| crate::fs_error::io(error, "mkdir", parent))?;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&link_target, dest)
      .map_err(|error| crate::fs_error::io_dest(error, "symlink", &link_target, Some(dest)))?;
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
      return Err(crate::fs_error::custom(
        "ERR_FS_EISDIR",
        "cp",
        src,
        None,
        "Path is a directory; set recursive to true",
      ));
    }

    let created = !dest.exists();
    if created {
      fs::create_dir_all(dest).map_err(|error| crate::fs_error::io(error, "mkdir", dest))?;
    }

    let entries: Vec<_> = fs::read_dir(src)
      .map_err(|error| crate::fs_error::io(error, "scandir", src))?
      .collect::<std::io::Result<_>>()
      .map_err(|error| crate::fs_error::io(error, "scandir", src))?;

    if parallel {
      entries.par_iter().try_for_each(|entry| -> Result<()> {
        cp_impl(&entry.path(), &dest.join(entry.file_name()), opts, true)
      })?;
    } else {
      for entry in &entries {
        cp_impl(&entry.path(), &dest.join(entry.file_name()), opts, false)?;
      }
    }

    if created {
      fs::set_permissions(dest, meta.permissions())
        .map_err(|error| crate::fs_error::io(error, "chmod", dest))?;
    }
  } else {
    if dest_meta.is_some() {
      if error_on_exist && !force {
        return Err(crate::fs_error::custom(
          "ERR_FS_CP_EEXIST",
          "cp",
          dest,
          None,
          "file already exists",
        ));
      }
      if !force {
        return Ok(());
      }
    }

    if let Some(parent) = dest.parent() {
      if !parent.exists() {
        fs::create_dir_all(parent).map_err(|error| crate::fs_error::io(error, "mkdir", parent))?;
      }
    }

    if dest_meta.is_some() {
      fs::remove_file(dest).map_err(|error| crate::fs_error::io(error, "unlink", dest))?;
    }
    fs::copy(src, dest)
      .map_err(|error| crate::fs_error::io_dest(error, "copyfile", src, Some(dest)))?;

    if preserve_timestamps {
      set_timestamps(src, dest).map_err(|error| crate::fs_error::io(error, "utime", dest))?;
    }
  }

  Ok(())
}

fn lexical_absolute(path: &Path) -> Result<std::path::PathBuf> {
  let absolute =
    std::path::absolute(path).map_err(|error| crate::fs_error::io(error, "realpath", path))?;
  let mut normalized = std::path::PathBuf::new();
  for component in absolute.components() {
    match component {
      std::path::Component::ParentDir => {
        normalized.pop();
      }
      std::path::Component::CurDir => {}
      component => normalized.push(component),
    }
  }
  Ok(normalized)
}

fn resolve_destination(path: &Path) -> Result<std::path::PathBuf> {
  if let Ok(resolved) = fs::canonicalize(path) {
    return Ok(resolved);
  }
  let absolute =
    std::path::absolute(path).map_err(|error| crate::fs_error::io(error, "realpath", path))?;
  let mut parent = absolute.as_path();
  let mut suffix = Vec::new();
  loop {
    if let Ok(mut resolved) = fs::canonicalize(parent) {
      for part in suffix.into_iter().rev() {
        resolved.push(part);
      }
      return Ok(resolved);
    }
    if let Some(name) = parent.file_name() {
      suffix.push(name.to_os_string());
    }
    match parent.parent() {
      Some(next) => parent = next,
      None => return Ok(absolute),
    }
  }
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
  // Resolve directory ancestors before creating a descendant. The final symlink
  // itself must not be followed: a file copy may replace a link to the source.
  let source_meta = if opts.dereference.unwrap_or(false) {
    fs::metadata(src)
  } else {
    fs::symlink_metadata(src)
  };
  if source_meta.is_ok_and(|meta| meta.is_dir())
    && fs::symlink_metadata(dest)
      .map(|meta| meta.is_dir())
      .unwrap_or(true)
  {
    let source = fs::canonicalize(src).ok();
    let destination = resolve_destination(dest)?;
    if let Some(source) = source {
      if destination == source || destination.starts_with(&source) {
        return Err(crate::fs_error::custom(
          "ERR_FS_CP_EINVAL",
          "cp",
          dest,
          None,
          "cannot copy a path into itself",
        ));
      }
    }
  }
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
pub fn cp_sync(env: Env, src: String, dest: String, options: Option<CpOptions>) -> Result<()> {
  cp_entry(src, dest, options).map_err(|error| crate::fs_error::into_js(env, error))
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

  fn reject(&mut self, env: Env, error: Error) -> Result<Self::JsValue> {
    Err(crate::fs_error::into_js(env, error))
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "cp", ts_return_type = "Promise<void>")]
pub fn cp(src: String, dest: String, options: Option<CpOptions>) -> AsyncTask<CpTask> {
  AsyncTask::new(CpTask { src, dest, options })
}
