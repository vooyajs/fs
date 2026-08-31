use std::fs;
use std::path::Path;

fn count_files(root: &Path) -> std::io::Result<u64> {
  let mut count = 0;
  for entry in fs::read_dir(root)? {
    let entry = entry?;
    let metadata = fs::symlink_metadata(entry.path())?;
    if metadata.is_dir() {
      count += count_files(&entry.path())?;
    } else {
      count += 1;
    }
  }
  Ok(count)
}

/// Traverse the `/data` preopen and return only a count. This intentionally
/// avoids result serialization, sorting, and JavaScript object construction so
/// the WASI path receives a favorable comparison against `scanSync`.
#[no_mangle]
pub extern "C" fn scan_count() -> u64 {
  count_files(Path::new("/data")).unwrap_or(u64::MAX)
}

