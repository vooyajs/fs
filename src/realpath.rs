use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

#[cfg(windows)]
fn strip_verbatim_prefix(s: String) -> String {
  if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
    // \\?\UNC\server\share\path -> \\server\share\path
    return format!(r"\\{}", rest);
  }
  if let Some(rest) = s.strip_prefix(r"\\?\") {
    return rest.to_string();
  }
  s
}

fn realpath_impl(path_str: String) -> Result<String> {
  let path = Path::new(&path_str);
  let resolved = fs::canonicalize(path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, realpath '{}'",
        path.to_string_lossy()
      ))
    } else {
      Error::from_reason(e.to_string())
    }
  })?;

  #[cfg(windows)]
  {
    // Return long path (strip \\?\) to match node:fs; do not use GetShortPathNameW (8.3) so tests match.
    let s = resolved.to_string_lossy().to_string();
    return Ok(strip_verbatim_prefix(s));
  }

  #[cfg(not(windows))]
  Ok(resolved.to_string_lossy().to_string())
}

#[napi(js_name = "realpathSync")]
pub fn realpath_sync(path: String) -> Result<String> {
  realpath_impl(path)
}

// ========= async version =========

pub struct RealpathTask {
  pub path: String,
}

impl Task for RealpathTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    realpath_impl(self.path.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "realpath", ts_return_type = "Promise<string>")]
pub fn realpath(path: String) -> AsyncTask<RealpathTask> {
  AsyncTask::new(RealpathTask { path })
}
