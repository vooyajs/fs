use crate::types::Dirent;
use crate::utils::get_file_type_id;
use jwalk::{Parallelism, WalkDir};
use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;
use std::fs;
use std::path::Path;
use std::time::Duration;

// # nodejs readdir jsdoc:
/**
 * Reads the contents of a directory.
 * @param {string | Buffer | URL} path
 * @param {string | {
 *   encoding?: string;
 *   withFileTypes?: boolean;
 *   recursive?: boolean;
 *   }} [options]
 * @param {(
 *   err?: Error,
 *   files?: string[] | Buffer[] | Dirent[]
 * ) => any} callback
 * @returns {void}
 */

#[napi(object)]
#[derive(Clone)]
pub struct ReaddirOptions {
  /// File name encoding. 'utf8' (default) returns strings.
  /// 'buffer' returns Buffer objects for each name.
  /// Other values are treated as 'utf8'.
  pub encoding: Option<String>,
  pub skip_hidden: Option<bool>,
  pub concurrency: Option<u32>,
  pub recursive: Option<bool>,
  pub with_file_types: Option<bool>,
}

// #[napi] // marco: expose the function to Node
fn ls(
  path_str: String,
  options: Option<ReaddirOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  let search_path_str = if path_str.is_empty() { "." } else { &path_str };
  let path = Path::new(search_path_str);
  if !Path::new(&path).exists() {
    return Err(Error::from_reason(format!(
      "ENOENT: no such file or directory, readdir '{}'",
      path.to_string_lossy()
    )));
  }
  let opts = options.unwrap_or(ReaddirOptions {
    encoding: None,
    skip_hidden: Some(false),
    concurrency: None,
    recursive: Some(false),
    with_file_types: Some(false),
  });

  let skip_hidden = opts.skip_hidden.unwrap_or(false);
  let recursive = opts.recursive.unwrap_or(false);
  let with_file_types = opts.with_file_types.unwrap_or(false);
  // 'buffer' encoding is not supported in vooya-fs (we always return String).
  // All other encoding values are treated as 'utf8'.
  let _encoding = opts.encoding.as_deref().unwrap_or("utf8");

  if !recursive {
    let parent_path_val = search_path_str.to_string();
    let entries = fs::read_dir(path).map_err(|e| Error::from_reason(e.to_string()))?;

    let mut result_files = if with_file_types {
      None
    } else {
      Some(Vec::with_capacity(64))
    };
    let mut result_dirents = if with_file_types {
      Some(Vec::with_capacity(64))
    } else {
      None
    };

    for entry in entries {
      let entry = entry.map_err(|e| Error::from_reason(e.to_string()))?;
      let file_name = entry.file_name();
      let name_str = file_name.to_string_lossy();
      if skip_hidden && name_str.starts_with('.') {
        continue;
      }

      if let Some(ref mut list) = result_dirents {
        list.push(Dirent {
          name: name_str.to_string(),
          parent_path: parent_path_val.clone(),
          file_type: entry.file_type().map(|t| get_file_type_id(&t)).unwrap_or(0),
        });
      } else if let Some(ref mut list) = result_files {
        list.push(name_str.to_string());
      }
    }

    if with_file_types {
      return Ok(Either::B(result_dirents.unwrap()));
    } else {
      return Ok(Either::A(result_files.unwrap()));
    }
  }

  let parallelism = match opts.concurrency {
    Some(0 | 1) => Parallelism::Serial,
    Some(n) => Parallelism::RayonNewPool(n as usize),
    None => Parallelism::RayonDefaultPool {
      busy_timeout: Duration::from_secs(1),
    },
  };
  let walk_dir = WalkDir::new(path)
    .skip_hidden(skip_hidden)
    .parallelism(parallelism);

  if with_file_types {
    let mut result = Vec::new();
    for entry in walk_dir.into_iter() {
      let e = entry.map_err(|error| Error::from_reason(error.to_string()))?;
      if e.depth() > 0 {
        let p = e.path();
        let parent = p
          .parent()
          .unwrap_or(Path::new(""))
          .to_string_lossy()
          .to_string();

        result.push(Dirent {
          name: e.file_name().to_string_lossy().to_string(),
          parent_path: parent,
          file_type: get_file_type_id(&e.file_type()),
        });
      }
    }
    Ok(Either::B(result))
  } else {
    // When recursive is true and withFileTypes is false, Node.js returns relative paths.
    // But jwalk entries have full paths, We need to strip the root path.
    let root = path;
    let mut result = Vec::new();
    for entry in walk_dir.into_iter() {
      let e = entry.map_err(|error| Error::from_reason(error.to_string()))?;
      if e.depth() > 0 {
        // Get path relative to root
        let p = e.path();
        result.push(match p.strip_prefix(root) {
          Ok(relative) => relative.to_string_lossy().to_string(),
          Err(_) => e.file_name().to_string_lossy().to_string(), // Fallback
        });
      }
    }
    Ok(Either::A(result))
  }
}

#[napi(js_name = "readdirSync")]
pub fn readdir_sync(
  path: String,
  options: Option<ReaddirOptions>,
) -> Result<Either<Vec<String>, Vec<Dirent>>> {
  ls(path, options)
}

// ========= async version =========

pub struct ReaddirTask {
  pub path: String,
  pub options: Option<ReaddirOptions>,
}

impl Task for ReaddirTask {
  type Output = Either<Vec<String>, Vec<Dirent>>;
  type JsValue = Either<Vec<String>, Vec<Dirent>>;

  fn compute(&mut self) -> Result<Self::Output> {
    ls(self.path.clone(), self.options.clone())
  }
  fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi(
  js_name = "readdir",
  ts_return_type = "Promise<Array<string> | Array<Dirent>>"
)]
pub fn readdir(path: String, options: Option<ReaddirOptions>) -> AsyncTask<ReaddirTask> {
  AsyncTask::new(ReaddirTask { path, options })
}
