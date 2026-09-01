import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

export type ScaleName = 'tiny' | 'small' | 'medium' | 'large' | 'extreme'

export interface ScaleProfile {
  name: ScaleName
  breadth: number
  depth: number
  filesPerDir: number
  fileSize: number
  manualOnly?: boolean
}

export interface ScaleFixture {
  root: string
  profile: ScaleProfile
  files: number
  dirs: number
}

export const scaleProfiles: Record<ScaleName, ScaleProfile> = {
  tiny: { name: 'tiny', breadth: 1, depth: 1, filesPerDir: 4, fileSize: 32 },
  small: { name: 'small', breadth: 3, depth: 2, filesPerDir: 8, fileSize: 256 },
  medium: { name: 'medium', breadth: 4, depth: 4, filesPerDir: 8, fileSize: 1024 },
  large: { name: 'large', breadth: 5, depth: 6, filesPerDir: 8, fileSize: 1024 },
  extreme: { name: 'extreme', breadth: 6, depth: 6, filesPerDir: 12, fileSize: 2048, manualOnly: true },
}

export async function createScaleFixture(api: string, scale: ScaleName): Promise<ScaleFixture> {
  const profile = scaleProfiles[scale]
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `vooya-fs-${api}-${scale}-`))
  const content = 'x'.repeat(profile.fileSize)
  let files = 0
  let dirs = 1

  async function build(dir: string, level: number): Promise<void> {
    for (let i = 0; i < profile.filesPerDir; i++) {
      await fs.writeFile(path.join(dir, `file-${level}-${i}.txt`), content)
      files += 1
    }

    if (level >= profile.depth) return

    for (let i = 0; i < profile.breadth; i++) {
      const child = path.join(dir, `dir-${level}-${i}`)
      await fs.mkdir(child)
      dirs += 1
      await build(child, level + 1)
    }
  }

  await build(root, 0)
  return { root, profile, files, dirs }
}

export async function removeFixture(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true })
}

export async function listTree(root: string): Promise<string[]> {
  const entries: string[] = []

  async function walk(dir: string): Promise<void> {
    const names = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of names) {
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full).replaceAll(path.sep, '/')
      entries.push(entry.isDirectory() ? `${rel}/` : rel)
      if (entry.isDirectory()) {
        await walk(full)
      }
    }
  }

  await walk(root)
  return entries.sort()
}

export async function copyFixture(src: string, label: string): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), `vooya-fs-copy-${label}-`))
  await fs.rm(dest, { force: true, recursive: true })
  await fs.cp(src, dest, { recursive: true })
  return dest
}
