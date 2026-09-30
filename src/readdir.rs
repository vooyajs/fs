use crate::types::Dirent;
use crate::utils::get_file_type_id;
use jwalk::{Parallelism, WalkDir};
use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::{fs, path::Path, time::Duration};

#[napi(object)]
#[derive(Clone, Default)]
pub struct ReaddirOptions {
  /// Node filename encoding; `buffer` preserves the filename bytes.
  pub encoding: Option<String>,
  pub skip_hidden: Option<bool>,
  pub concurrency: Option<u32>,
  pub recursive: Option<bool>,
  pub with_file_types: Option<bool>,
}

type Entries = Either3<Vec<String>, Vec<Buffer>, Vec<Dirent>>;

fn name(value: &std::ffi::OsStr, encoding: &str) -> Result<Either<String, Buffer>> {
  let bytes = value.as_encoded_bytes().to_vec();
  if encoding == "buffer" {
    Ok(Either::B(Buffer::from(bytes)))
  } else {
    crate::read_file::decode_data(bytes, Some(encoding))
  }
}

fn ls(
  path_str: String,
  options: Option<Either<String, ReaddirOptions>>,
  synchronous: bool,
) -> Result<Entries> {
  let opts = match options {
    Some(Either::A(encoding)) => ReaddirOptions {
      encoding: Some(encoding),
      ..Default::default()
    },
    Some(Either::B(options)) => options,
    None => ReaddirOptions::default(),
  };
  let path = Path::new(&path_str);
  let encoding = opts.encoding.as_deref().unwrap_or("utf8");
  // Validate even for an empty directory, before starting traversal.
  name(std::ffi::OsStr::new(""), encoding)?;
  let metadata = fs::metadata(path).map_err(|error| crate::fs_error::io(error, "scandir", path))?;
  if !metadata.is_dir() {
    return Err(crate::fs_error::io(
      std::io::Error::from(std::io::ErrorKind::NotADirectory),
      "scandir",
      path,
    ));
  }
  let skip_hidden = opts.skip_hidden.unwrap_or(false);
  let with_file_types = opts.with_file_types.unwrap_or(false);
  let mut strings = Vec::new();
  let mut buffers = Vec::new();
  let mut dirents = Vec::new();
  let mut push = |full: &Path, basename: &std::ffi::OsStr, file_type: fs::FileType| -> Result<()> {
    if with_file_types {
      dirents.push(Dirent {
        name: match name(basename, encoding)? {
          Either::A(value) => Either::A(value),
          Either::B(value) => Either::B(value.to_vec()),
        },
        parent_path: full.parent().unwrap_or(path).to_string_lossy().into_owned(),
        file_type: get_file_type_id(&file_type),
      });
    } else {
      let relative = full.strip_prefix(path).unwrap_or(full);
      match name(relative.as_os_str(), encoding)? {
        Either::A(value) => strings.push(value),
        Either::B(value) => buffers.push(value),
      }
    }
    Ok(())
  };
  if !opts.recursive.unwrap_or(false) {
    for entry in fs::read_dir(path).map_err(|error| crate::fs_error::io(error, "scandir", path))? {
      let entry = entry.map_err(|error| crate::fs_error::io(error, "scandir", path))?;
      let basename = entry.file_name();
      if skip_hidden && basename.to_string_lossy().starts_with('.') {
        continue;
      }
      let file_type = entry
        .file_type()
        .map_err(|error| crate::fs_error::io(error, "lstat", &entry.path()))?;
      push(&entry.path(), &basename, file_type)?;
    }
  } else {
    let parallelism = match opts.concurrency {
      Some(1) => Parallelism::Serial,
      Some(n) if n > 1 => Parallelism::RayonNewPool(n as usize),
      _ => Parallelism::RayonDefaultPool {
        busy_timeout: Duration::from_secs(1),
      },
    };
    for entry in WalkDir::new(path)
      .follow_links(synchronous || !with_file_types)
      .skip_hidden(skip_hidden)
      .parallelism(parallelism)
    {
      let mut entry = match entry {
        Ok(entry) => entry,
        Err(error) => {
          let failed = error.path().unwrap_or(path);
          // Broken symlinks are directory entries even though their targets cannot be followed.
          if let Ok(metadata) = fs::symlink_metadata(failed) {
            if metadata.is_symlink()
              && error
                .io_error()
                .is_some_and(|io| io.kind() == std::io::ErrorKind::NotFound)
            {
              push(
                failed,
                failed.file_name().unwrap_or_default(),
                metadata.file_type(),
              )?;
              continue;
            }
          }
          return Err(match error.io_error() {
            Some(io) => crate::fs_error::io(
              io.raw_os_error()
                .map(std::io::Error::from_raw_os_error)
                .unwrap_or_else(|| std::io::Error::new(io.kind(), io.to_string())),
              "scandir",
              failed,
            ),
            None => crate::fs_error::custom("ELOOP", "scandir", failed, None, &error.to_string()),
          });
        }
      };
      if let Some(error) = entry.read_children_error.take() {
        return Err(match error.io_error() {
          Some(io) => crate::fs_error::io(
            io.raw_os_error()
              .map(std::io::Error::from_raw_os_error)
              .unwrap_or_else(|| std::io::Error::new(io.kind(), io.to_string())),
            "scandir",
            &entry.path(),
          ),
          None => Error::from_reason(error.to_string()),
        });
      }
      if entry.depth() > 0 {
        let file_type = if entry.path_is_symlink() {
          fs::symlink_metadata(entry.path())
            .map_err(|error| crate::fs_error::io(error, "lstat", &entry.path()))?
            .file_type()
        } else {
          entry.file_type()
        };
        push(&entry.path(), entry.file_name(), file_type)?;
      }
    }
  }
  Ok(if with_file_types {
    Either3::C(dirents)
  } else if encoding == "buffer" {
    Either3::B(buffers)
  } else {
    Either3::A(strings)
  })
}

#[napi(
  js_name = "readdirSync",
  ts_generic_types = "const T extends ReaddirOptions | string | null | undefined = undefined",
  ts_args_type = "path: string, options?: T",
  ts_return_type = "T extends { withFileTypes: true } ? Array<Omit<Dirent, 'name'> & { readonly name: T extends { encoding: 'buffer' } ? Buffer : string }> : T extends 'buffer' | { encoding: 'buffer' } ? Array<Buffer> : T extends string | null | undefined | { withFileTypes?: false } ? Array<string> : 'withFileTypes' extends keyof T ? Array<string> | Array<Buffer> | Array<Dirent> : Array<string>"
)]
pub fn readdir_sync(
  env: Env,
  path: String,
  options: Option<Either<String, ReaddirOptions>>,
) -> Result<Entries> {
  ls(path, options, true).map_err(|error| crate::fs_error::into_js(env, error))
}

pub struct ReaddirTask {
  pub path: String,
  pub options: Option<Either<String, ReaddirOptions>>,
}
impl Task for ReaddirTask {
  type Output = Entries;
  type JsValue = Entries;
  fn compute(&mut self) -> Result<Entries> {
    ls(self.path.clone(), self.options.clone(), false)
  }
  fn resolve(&mut self, _env: Env, output: Entries) -> Result<Entries> {
    Ok(output)
  }
  fn reject(&mut self, env: Env, error: Error) -> Result<Entries> {
    Err(crate::fs_error::into_js(env, error))
  }
}
#[napi(
  js_name = "readdir",
  ts_generic_types = "const T extends ReaddirOptions | string | null | undefined = undefined",
  ts_args_type = "path: string, options?: T",
  ts_return_type = "Promise<T extends { withFileTypes: true } ? Array<Omit<Dirent, 'name'> & { readonly name: T extends { encoding: 'buffer' } ? Buffer : string }> : T extends 'buffer' | { encoding: 'buffer' } ? Array<Buffer> : T extends string | null | undefined | { withFileTypes?: false } ? Array<string> : 'withFileTypes' extends keyof T ? Array<string> | Array<Buffer> | Array<Dirent> : Array<string>>"
)]
pub fn readdir(
  path: String,
  options: Option<Either<String, ReaddirOptions>>,
) -> AsyncTask<ReaddirTask> {
  AsyncTask::new(ReaddirTask { path, options })
}
