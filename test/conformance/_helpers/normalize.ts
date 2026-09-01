import type { ExecutionContext } from 'ava'

type ExecutionResult<T> = { ok: true; value: T } | { ok: false; error: unknown }

export async function capture<T>(fn: () => Promise<T>): Promise<ExecutionResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error }
  }
}

export function normalizePaths(paths: string[]): string[] {
  return paths.map((entry) => entry.replaceAll('\\', '/')).sort()
}

export function normalizeDirents(entries: unknown[]): Array<Record<string, boolean | string>> {
  return entries
    .map((entry) => {
      const dirent = entry as {
        name: string
        isFile: () => boolean
        isDirectory: () => boolean
        isSymbolicLink: () => boolean
      }
      return {
        name: dirent.name,
        isFile: dirent.isFile(),
        isDirectory: dirent.isDirectory(),
        isSymbolicLink: dirent.isSymbolicLink(),
      }
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function normalizeError(error: unknown): Record<string, unknown> {
  const err = error as NodeJS.ErrnoException
  return {
    name: err?.name,
    code: err?.code,
    path: err?.path ? String(err.path).replaceAll('\\', '/') : undefined,
    syscall: err?.syscall,
  }
}

export function assertSameErrorShape(t: ExecutionContext, nodeError: unknown, vooyaError: unknown): void {
  const nodeShape = normalizeError(nodeError)
  const vooyaShape = normalizeError(vooyaError)
  t.is(vooyaShape.code, nodeShape.code)
  t.is(vooyaShape.syscall, nodeShape.syscall)
}
