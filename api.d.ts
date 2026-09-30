import type * as fs from 'node:fs'
import type * as promises from 'node:fs/promises'
import type * as binding from './index.js'

export * from './index.js'
export { constants } from 'node:fs'

export type CpOptions = fs.CopyOptions & { concurrency?: number }
export type CpSyncOptions = fs.CopySyncOptions & { concurrency?: number }
export type RmOptions = fs.RmOptions & { concurrency?: number }
export type ReaddirOptions = binding.ReaddirOptions
export type ScanOptions = binding.ScanOptions
export type GlobOptions = fs.GlobOptions & { concurrency?: number; gitIgnore?: boolean }

type ReaddirResult<T> = T extends { withFileTypes: true }
  ? Array<Omit<binding.Dirent, 'name'> & { readonly name: T extends { encoding: 'buffer' } ? Buffer : string }>
  : T extends 'buffer' | { encoding: 'buffer' }
    ? Buffer[]
    : T extends string | null | undefined
      ? string[]
      : 'withFileTypes' extends keyof T
        ? string[] | Buffer[] | binding.Dirent[]
        : string[]

export function readdir<const T extends ReaddirOptions | string | null | undefined = undefined>(
  path: fs.PathLike,
  options?: T,
): Promise<ReaddirResult<T>>
export function readdirSync<const T extends ReaddirOptions | string | null | undefined = undefined>(
  path: fs.PathLike,
  options?: T,
): ReaddirResult<T>
export function cp(src: fs.PathLike, dest: fs.PathLike, options?: CpOptions): Promise<void>
export function cpSync(src: fs.PathLike, dest: fs.PathLike, options?: CpSyncOptions): void
export function rm(path: fs.PathLike, options?: RmOptions): Promise<void>
export function rmSync(path: fs.PathLike, options?: RmOptions): void

export const readFile: typeof promises.readFile & {
  (path: fs.PathLike, options: binding.ReadFileOptions & { encoding: string }): Promise<string>
  (path: fs.PathLike, options?: binding.ReadFileOptions | string | null): Promise<string | Buffer>
}
export const readFileSync: typeof fs.readFileSync & {
  (path: fs.PathLike, options: binding.ReadFileOptions & { encoding: string }): string
  (path: fs.PathLike, options?: binding.ReadFileOptions | string | null): string | Buffer
}

/** Awaitable native batch with Node-compatible async iteration. Results are materialized in memory. */
export type GlobResult<T> = Promise<T[]> & AsyncIterableIterator<T>
export function glob(
  pattern: string | readonly string[],
  options: fs.GlobOptionsWithFileTypes & { concurrency?: number; gitIgnore?: boolean },
): GlobResult<fs.Dirent>
export function glob(
  pattern: string | readonly string[],
  options?: fs.GlobOptionsWithoutFileTypes & { concurrency?: number; gitIgnore?: boolean },
): GlobResult<string>
export function glob(pattern: string | readonly string[], options?: GlobOptions): GlobResult<string | fs.Dirent>
export function globSync(
  pattern: string | readonly string[],
  options: fs.GlobOptionsWithFileTypes & { concurrency?: number; gitIgnore?: boolean },
): fs.Dirent[]
export function globSync(
  pattern: string | readonly string[],
  options?: fs.GlobOptionsWithoutFileTypes & { concurrency?: number; gitIgnore?: boolean },
): string[]
export function globSync(pattern: string | readonly string[], options?: GlobOptions): Array<string | fs.Dirent>
export function scan(root: fs.PathLike, options?: ScanOptions): Promise<binding.ScanEntry[]>
export function scanSync(root: fs.PathLike, options?: ScanOptions): binding.ScanEntry[]
