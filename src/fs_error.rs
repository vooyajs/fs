//! Carry filesystem error metadata through worker threads without creating JS values there.
use napi::bindgen_prelude::{JsObjectValue, JsValue};
use napi::{Env, Error};
use serde::{Deserialize, Serialize};
use std::{io, path::Path};

const PREFIX: &str = "vooya-fs-error:";

#[derive(Serialize, Deserialize)]
struct Details {
  code: String,
  syscall: String,
  path: String,
  dest: Option<String>,
  errno: Option<i32>,
  message: String,
}

pub fn custom(code: &str, syscall: &str, path: &Path, dest: Option<&Path>, message: &str) -> Error {
  pack(Details {
    code: code.into(),
    syscall: syscall.into(),
    path: path.to_string_lossy().into_owned(),
    dest: dest.map(|p| p.to_string_lossy().into_owned()),
    errno: None,
    message: format!("{code}: {message}, {syscall} '{}'", path.display()),
  })
}

fn pack(details: Details) -> Error {
  Error::from_reason(format!(
    "{PREFIX}{}",
    serde_json::to_string(&details).expect("serializable error")
  ))
}

pub fn io(error: io::Error, syscall: &str, path: &Path) -> Error {
  io_dest(error, syscall, path, None)
}

pub fn io_dest(error: io::Error, syscall: &str, path: &Path, dest: Option<&Path>) -> Error {
  #[cfg(unix)]
  let raw_code = match error.raw_os_error() {
    Some(libc::EPERM) => Some("EPERM"),
    Some(libc::ELOOP) => Some("ELOOP"),
    Some(libc::EMFILE) => Some("EMFILE"),
    Some(libc::ENFILE) => Some("ENFILE"),
    Some(libc::EBUSY) => Some("EBUSY"),
    Some(libc::ENAMETOOLONG) => Some("ENAMETOOLONG"),
    _ => None,
  };
  #[cfg(not(unix))]
  let raw_code: Option<&str> = None;
  let code = raw_code.unwrap_or(match error.kind() {
    io::ErrorKind::NotFound => "ENOENT",
    io::ErrorKind::PermissionDenied => "EACCES",
    io::ErrorKind::AlreadyExists => "EEXIST",
    io::ErrorKind::NotADirectory => "ENOTDIR",
    io::ErrorKind::IsADirectory => "EISDIR",
    io::ErrorKind::DirectoryNotEmpty => "ENOTEMPTY",
    io::ErrorKind::InvalidInput => "EINVAL",
    io::ErrorKind::StorageFull => "ENOSPC",
    io::ErrorKind::ReadOnlyFilesystem => "EROFS",
    io::ErrorKind::CrossesDevices => "EXDEV",
    _ => "EIO",
  });
  pack(Details {
    code: code.into(),
    syscall: syscall.into(),
    path: path.to_string_lossy().into_owned(),
    dest: dest.map(|path| path.to_string_lossy().into_owned()),
    errno: error.raw_os_error().map(|value| -value.abs()),
    message: format!("{code}: {error}, {syscall} '{}'", path.display()),
  })
}

pub fn into_js(env: Env, error: Error) -> Error {
  let Some(payload) = error.reason.strip_prefix(PREFIX) else {
    return error;
  };
  let Ok(details) = serde_json::from_str::<Details>(payload) else {
    return error;
  };
  let result = (|| -> napi::Result<Error> {
    let mut object = env.create_error(Error::from_reason(details.message))?;
    object.set_named_property("code", details.code)?;
    object.set_named_property("syscall", details.syscall)?;
    object.set_named_property("path", details.path)?;
    if let Some(dest) = details.dest {
      object.set_named_property("dest", dest)?;
    }
    if let Some(errno) = details.errno {
      object.set_named_property("errno", errno)?;
    }
    Ok(Error::from(object.to_unknown()))
  })();
  result.unwrap_or_else(|error| error)
}

pub fn walk(error: ignore::Error, path: &Path) -> Error {
  match error {
    ignore::Error::WithPath { path, err } => walk(*err, &path),
    ignore::Error::WithDepth { err, .. } | ignore::Error::WithLineNumber { err, .. } => {
      walk(*err, path)
    }
    ignore::Error::Io(error) => io(error, "scandir", path),
    ignore::Error::Loop { child, .. } => {
      custom("ELOOP", "scandir", &child, None, "symbolic link loop")
    }
    error => custom("EIO", "scandir", path, None, &error.to_string()),
  }
}
