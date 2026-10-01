use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;

pub(crate) fn decode_data(data: Vec<u8>, encoding: Option<&str>) -> Result<Either<String, Buffer>> {
  let normalized = encoding.map(str::to_ascii_lowercase);
  match normalized.as_deref() {
    Some("utf8" | "utf-8") => {
      let s = String::from_utf8(data)
        .unwrap_or_else(|error| String::from_utf8_lossy(error.as_bytes()).into_owned());
      Ok(Either::A(s))
    }
    Some("ascii") => {
      let s: String = data.iter().map(|&b| (b & 0x7f) as char).collect();
      Ok(Either::A(s))
    }
    Some("latin1" | "binary") => {
      let s: String = data.iter().map(|&b| b as char).collect();
      Ok(Either::A(s))
    }
    Some("base64") => Ok(Either::A(base64_encode(&data, false))),
    Some("base64url") => Ok(Either::A(base64_encode(&data, true))),
    Some("hex") => {
      let s: String = data.iter().map(|b| format!("{:02x}", b)).collect();
      Ok(Either::A(s))
    }
    Some(enc) => Err(Error::from_reason(format!("Unknown encoding: {}", enc))),
    None => Ok(Either::B(Buffer::from(data))),
  }
}

fn base64_encode(data: &[u8], url_safe: bool) -> String {
  const STD: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let table = if url_safe { URL } else { STD };

  let mut result = String::with_capacity(data.len().div_ceil(3) * 4);
  let chunks = data.chunks(3);
  for chunk in chunks {
    let b0 = chunk[0] as u32;
    let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
    let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
    let triple = (b0 << 16) | (b1 << 8) | b2;

    result.push(table[((triple >> 18) & 0x3F) as usize] as char);
    result.push(table[((triple >> 12) & 0x3F) as usize] as char);
    if chunk.len() > 1 {
      result.push(table[((triple >> 6) & 0x3F) as usize] as char);
    } else if !url_safe {
      result.push('=');
    }
    if chunk.len() > 2 {
      result.push(table[(triple & 0x3F) as usize] as char);
    } else if !url_safe {
      result.push('=');
    }
  }
  result
}

#[napi(object)]
#[derive(Clone)]
pub struct LineRange {
  pub from: u32,
  pub to: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct ReadFileOptions {
  pub encoding: Option<String>,
  pub flag: Option<String>,
  pub lines: Option<LineRange>,
}

fn normalize_read_file_options(
  options: Option<Either<String, ReadFileOptions>>,
) -> ReadFileOptions {
  match options {
    Some(Either::A(encoding)) => ReadFileOptions {
      encoding: Some(encoding),
      flag: None,
      lines: None,
    },
    Some(Either::B(opts)) => opts,
    None => ReadFileOptions {
      encoding: None,
      flag: None,
      lines: None,
    },
  }
}

fn read_file_with_lines(
  path: &Path,
  open_opts: &mut fs::OpenOptions,
  range: LineRange,
  encoding: Option<&str>,
) -> Result<String> {
  use std::io::{BufRead, BufReader};

  if range.from < 1 || range.to < range.from {
    return Ok(String::new());
  }

  let file = open_opts
    .open(path)
    .map_err(|error| crate::fs_error::io(error, "open", path))?;
  let mut reader = BufReader::with_capacity(64 * 1024, file);
  let mut result = Vec::new();
  let mut line = Vec::new();
  let mut first = true;
  for current in 1..=range.to {
    line.clear();
    if reader
      .read_until(b'\n', &mut line)
      .map_err(|error| crate::fs_error::io(error, "read", path))?
      == 0
    {
      break;
    }
    if current < range.from {
      continue;
    }
    if line.last() == Some(&b'\n') {
      line.pop();
      if line.last() == Some(&b'\r') {
        line.pop();
      }
    }
    if !first {
      result.push(b'\n');
    }
    first = false;
    result.extend_from_slice(&line);
  }
  match decode_data(result, encoding)? {
    Either::A(value) => Ok(value),
    Either::B(_) => Ok(String::new()),
  }
}

fn read_file_impl(
  path_str: String,
  options: Option<Either<String, ReadFileOptions>>,
) -> Result<Either<String, Buffer>> {
  let path = Path::new(&path_str);
  let opts = normalize_read_file_options(options);

  let flag = opts.flag.as_deref().unwrap_or("r");

  let mut open_opts = fs::OpenOptions::new();
  match flag {
    "r" => {
      open_opts.read(true);
    }
    "rs" | "sr" => {
      open_opts.read(true);
    }
    "r+" => {
      open_opts.read(true).write(true);
    }
    "rs+" | "sr+" => {
      open_opts.read(true).write(true);
    }
    "a+" => {
      open_opts.read(true).append(true).create(true);
    }
    "ax+" | "xa+" => {
      open_opts.read(true).append(true).create_new(true);
    }
    "w+" => {
      open_opts.read(true).write(true).create(true).truncate(true);
    }
    "wx+" | "xw+" => {
      open_opts.read(true).write(true).create_new(true);
    }
    _ => {
      return Err(Error::from_reason(format!(
        "ERR_INVALID_ARG_VALUE: invalid flag '{}'",
        flag
      )))
    }
  }

  // The line-range extension streams the requested lines and must not open the
  // same file twice before reading it.
  if let (Some(lines), Some(_)) = (&opts.lines, &opts.encoding) {
    let contents = read_file_with_lines(
      path,
      &mut open_opts,
      lines.clone(),
      opts.encoding.as_deref(),
    )?;
    return Ok(Either::A(contents));
  }

  let mut file = open_opts
    .open(path)
    .map_err(|error| crate::fs_error::io(error, "open", path))?;

  use std::io::Read;
  let mut data = Vec::new();
  file
    .read_to_end(&mut data)
    .map_err(|error| crate::fs_error::io(error, "read", path))?;

  decode_data(data, opts.encoding.as_deref())
}

#[napi(js_name = "readFileSync")]
pub fn read_file_sync(
  env: Env,
  path: String,
  options: Option<Either<String, ReadFileOptions>>,
) -> Result<Either<String, Buffer>> {
  read_file_impl(path, options).map_err(|error| crate::fs_error::into_js(env, error))
}

// ========= async version =========

pub struct ReadFileTask {
  pub path: String,
  pub options: Option<Either<String, ReadFileOptions>>,
}

impl Task for ReadFileTask {
  type Output = Either<String, Buffer>;
  type JsValue = Either<String, Buffer>;

  fn compute(&mut self) -> Result<Self::Output> {
    read_file_impl(self.path.clone(), self.options.clone())
  }

  fn reject(&mut self, env: Env, error: Error) -> Result<Self::JsValue> {
    Err(crate::fs_error::into_js(env, error))
  }

  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(js_name = "readFile", ts_return_type = "Promise<string | Buffer>")]
pub fn read_file(
  path: String,
  options: Option<Either<String, ReadFileOptions>>,
) -> AsyncTask<ReadFileTask> {
  AsyncTask::new(ReadFileTask { path, options })
}
