use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

fn encode_string(s: &str, encoding: Option<&str>) -> Result<Vec<u8>> {
  match encoding {
    None | Some("utf8" | "utf-8") => Ok(s.as_bytes().to_vec()),
    Some("ascii") => Ok(s.bytes().map(|b| b & 0x7f).collect()),
    Some("latin1" | "binary") => Ok(s.chars().map(|c| c as u8).collect()),
    Some("base64") => base64_decode(s, false),
    Some("base64url") => base64_decode(s, true),
    Some("hex") => Ok(hex_decode(s)),
    Some(enc) => Err(Error::from_reason(format!("Unknown encoding: {}", enc))),
  }
}

fn base64_decode(s: &str, url_safe: bool) -> Result<Vec<u8>> {
  let mut buf = Vec::with_capacity(s.len() * 3 / 4);
  let mut acc: u32 = 0;
  let mut bits: u32 = 0;
  for c in s.chars() {
    let val = if url_safe {
      match c {
        'A'..='Z' => c as u32 - 'A' as u32,
        'a'..='z' => c as u32 - 'a' as u32 + 26,
        '0'..='9' => c as u32 - '0' as u32 + 52,
        '-' => 62,
        '_' => 63,
        '=' => continue,
        _ => continue,
      }
    } else {
      match c {
        'A'..='Z' => c as u32 - 'A' as u32,
        'a'..='z' => c as u32 - 'a' as u32 + 26,
        '0'..='9' => c as u32 - '0' as u32 + 52,
        '+' => 62,
        '/' => 63,
        '=' => continue,
        _ => continue,
      }
    };
    acc = (acc << 6) | val;
    bits += 6;
    if bits >= 8 {
      bits -= 8;
      buf.push((acc >> bits) as u8);
      acc &= (1 << bits) - 1;
    }
  }
  Ok(buf)
}

fn hex_decode(s: &str) -> Vec<u8> {
  let mut buf = Vec::with_capacity(s.len() / 2);
  let bytes = s.as_bytes();
  for pair in bytes.chunks_exact(2) {
    let (Some(hi), Some(lo)) = (hex_val(pair[0]), hex_val(pair[1])) else {
      break;
    };
    buf.push((hi << 4) | lo);
  }
  buf
}

fn hex_val(b: u8) -> Option<u8> {
  match b {
    b'0'..=b'9' => Some(b - b'0'),
    b'a'..=b'f' => Some(b - b'a' + 10),
    b'A'..=b'F' => Some(b - b'A' + 10),
    _ => None,
  }
}

#[napi(object)]
#[derive(Clone)]
pub struct WriteFileOptions {
  pub encoding: Option<String>,
  pub mode: Option<u32>,
  pub flag: Option<String>,
}

fn write_file_impl(
  path_str: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> Result<()> {
  let path = Path::new(&path_str);
  let opts = options.unwrap_or(WriteFileOptions {
    encoding: None,
    mode: None,
    flag: None,
  });

  let flag = opts.flag.as_deref().unwrap_or("w");
  let encoding = opts.encoding.as_deref();
  let bytes: Vec<u8> = match &data {
    Either::A(s) => encode_string(s, encoding)?,
    Either::B(b) => b.to_vec(),
  };

  let mut open_opts = OpenOptions::new();
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    open_opts.mode(opts.mode.unwrap_or(0o666));
  }
  match flag {
    "w" => {
      open_opts.write(true).create(true).truncate(true);
    }
    "wx" | "xw" => {
      open_opts.write(true).create_new(true);
    }
    "a" => {
      open_opts.append(true).create(true);
    }
    "ax" | "xa" => {
      open_opts.append(true).create_new(true);
    }
    _ => {
      return Err(Error::from_reason(format!(
        "ERR_INVALID_ARG_VALUE: invalid flag '{}'",
        flag
      )))
    }
  }

  let mut file = open_opts.open(path).map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
      Error::from_reason(format!(
        "ENOENT: no such file or directory, open '{}'",
        path.to_string_lossy()
      ))
    } else if e.kind() == std::io::ErrorKind::AlreadyExists {
      Error::from_reason(format!(
        "EEXIST: file already exists, open '{}'",
        path.to_string_lossy()
      ))
    } else {
      Error::from_reason(e.to_string())
    }
  })?;

  file
    .write_all(&bytes)
    .map_err(|e| Error::from_reason(e.to_string()))?;

  Ok(())
}

#[napi(js_name = "writeFileSync")]
pub fn write_file_sync(
  path: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> Result<()> {
  write_file_impl(path, data, options)
}

// ========= async version =========

pub struct WriteFileTask {
  pub path: String,
  pub string_data: Option<String>,
  pub bytes_data: Option<Vec<u8>>,
  pub options: Option<WriteFileOptions>,
}

impl Task for WriteFileTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    let data = if let Some(s) = self.string_data.take() {
      Either::A(s)
    } else {
      Either::B(Buffer::from(self.bytes_data.take().unwrap_or_default()))
    };
    write_file_impl(self.path.clone(), data, self.options.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "writeFile", ts_return_type = "Promise<void>")]
pub fn write_file(
  path: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> AsyncTask<WriteFileTask> {
  let (string_data, bytes_data) = match data {
    Either::A(s) => (Some(s), None),
    Either::B(b) => (None, Some(b.to_vec())),
  };
  AsyncTask::new(WriteFileTask {
    path,
    string_data,
    bytes_data,
    options,
  })
}

// appendFile is writeFile with flag='a'

fn append_file_impl(
  path_str: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> Result<()> {
  let opts = options.unwrap_or(WriteFileOptions {
    encoding: None,
    mode: None,
    flag: None,
  });
  let merged = WriteFileOptions {
    encoding: opts.encoding,
    mode: opts.mode,
    flag: Some(opts.flag.unwrap_or_else(|| "a".to_string())),
  };
  write_file_impl(path_str, data, Some(merged))
}

#[napi(js_name = "appendFileSync")]
pub fn append_file_sync(
  path: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> Result<()> {
  append_file_impl(path, data, options)
}

pub struct AppendFileTask {
  pub path: String,
  pub string_data: Option<String>,
  pub bytes_data: Option<Vec<u8>>,
  pub options: Option<WriteFileOptions>,
}

impl Task for AppendFileTask {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> Result<Self::Output> {
    let data = if let Some(s) = self.string_data.take() {
      Either::A(s)
    } else {
      Either::B(Buffer::from(self.bytes_data.take().unwrap_or_default()))
    };
    append_file_impl(self.path.clone(), data, self.options.clone())
  }

  fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
    Ok(())
  }
}

#[napi(js_name = "appendFile", ts_return_type = "Promise<void>")]
pub fn append_file(
  path: String,
  data: Either<String, Buffer>,
  options: Option<WriteFileOptions>,
) -> AsyncTask<AppendFileTask> {
  let (string_data, bytes_data) = match data {
    Either::A(s) => (Some(s), None),
    Either::B(b) => (None, Some(b.to_vec())),
  };
  AsyncTask::new(AppendFileTask {
    path,
    string_data,
    bytes_data,
    options,
  })
}
