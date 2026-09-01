use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

/// Generate a cryptographically seeded random 6-char suffix using OS random bytes.
/// Falls back to time-based entropy if the OS call fails.
fn generate_random_suffix() -> String {
  const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let mut bytes = [0u8; 6];

  // Try OS-level random source first (getrandom syscall on Linux/macOS, BCryptGenRandom on Windows)
  #[cfg(unix)]
  {
    use std::io::Read;
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
      let _ = f.read_exact(&mut bytes);
    } else {
      fill_fallback(&mut bytes);
    }
  }

  #[cfg(windows)]
  {
    // BCryptGenRandom via Windows CNG API
    // Link against bcrypt.lib on MSVC to resolve BCryptGenRandom.
    #[link(name = "bcrypt")]
    extern "system" {
      fn BCryptGenRandom(
        h_algorithm: *mut std::ffi::c_void,
        pb_buffer: *mut u8,
        cb_buffer: u32,
        dw_flags: u32,
      ) -> i32;
    }
    const BCRYPT_USE_SYSTEM_PREFERRED_RNG: u32 = 0x00000002;
    let ret = unsafe {
      BCryptGenRandom(
        std::ptr::null_mut(),
        bytes.as_mut_ptr(),
        bytes.len() as u32,
        BCRYPT_USE_SYSTEM_PREFERRED_RNG,
      )
    };
    if ret != 0 {
      fill_fallback(&mut bytes);
    }
  }

  #[cfg(not(any(unix, windows)))]
  fill_fallback(&mut bytes);

  let mut result = String::with_capacity(6);
  for &b in &bytes {
    result.push(CHARS[(b as usize) % CHARS.len()] as char);
  }
  result
}

/// Time + address based fallback when OS random is unavailable
fn fill_fallback(bytes: &mut [u8]) {
  use std::time::{SystemTime, UNIX_EPOCH};
  let stack_var: u8 = 0;
  let addr = &stack_var as *const u8 as u128;
  let mut seed = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_nanos()
    ^ addr;
  for b in bytes.iter_mut() {
    seed ^= seed << 13;
    seed ^= seed >> 7;
    seed ^= seed << 17;
    *b = (seed & 0xff) as u8;
  }
}

fn mkdtemp_impl(prefix: String) -> Result<String> {
  if let Some(parent) = Path::new(&prefix).parent() {
    if !parent.as_os_str().is_empty() && !parent.exists() {
      return Err(Error::from_reason(format!(
        "ENOENT: no such file or directory, mkdtemp '{}'",
        prefix
      )));
    }
  }

  // Retry up to 10 times — matches Node.js / libuv behavior
  for _ in 0..10 {
    let suffix = generate_random_suffix();
    let dir_path = format!("{}{}", prefix, suffix);
    match fs::create_dir(&dir_path) {
      Ok(()) => return Ok(dir_path),
      Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
      Err(e) => {
        return Err(Error::from_reason(format!("{}, mkdtemp '{}'", e, prefix)));
      }
    }
  }

  Err(Error::from_reason(format!(
    "EEXIST: could not create unique temporary directory after 10 attempts, mkdtemp '{}'",
    prefix
  )))
}

#[napi(js_name = "mkdtempSync")]
pub fn mkdtemp_sync(prefix: String) -> Result<String> {
  mkdtemp_impl(prefix)
}

// ========= async version =========

pub struct MkdtempTask {
  pub prefix: String,
}

impl Task for MkdtempTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    mkdtemp_impl(self.prefix.clone())
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "mkdtemp", ts_return_type = "Promise<string>")]
pub fn mkdtemp(prefix: String) -> AsyncTask<MkdtempTask> {
  AsyncTask::new(MkdtempTask { prefix })
}
