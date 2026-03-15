import { BadRequestException } from '@nestjs/common'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'

export interface DirectoryStats {
  sizeBytes: number
  fileCount: number
  lastModifiedAt?: Date
}

export function normalizeVersion(input: string): string {
  return input.trim().replace(/^v/i, '')
}

export function validateVersionSafe(version: string, fieldName: string = 'version'): void {
  if (!version) throw new BadRequestException(`${fieldName} is required`)
  if (version === '.' || version === '..') throw new BadRequestException(`invalid ${fieldName}`)
  if (version.includes('\0')) throw new BadRequestException(`invalid ${fieldName}`)
  if (version.includes('/') || version.includes('\\')) throw new BadRequestException(`invalid ${fieldName}`)
  if (version.includes('..')) throw new BadRequestException(`invalid ${fieldName}`)
  if (!/^[0-9a-zA-Z][0-9a-zA-Z.+_-]*$/.test(version)) {
    throw new BadRequestException(`invalid ${fieldName}`)
  }
}

export function parseSemver(version: string): number[] {
  const normalized = normalizeVersion(version)
  return normalized.split('.').map((segment) => {
    const parsed = Number(segment)
    return Number.isFinite(parsed) ? parsed : 0
  })
}

export function compareSemverDesc(a: string, b: string): number {
  const ap = parseSemver(a)
  const bp = parseSemver(b)
  const maxLen = Math.max(ap.length, bp.length)

  for (let index = 0; index < maxLen; index += 1) {
    const av = ap[index] ?? 0
    const bv = bp[index] ?? 0
    if (av !== bv) {
      return bv - av
    }
  }

  return b.localeCompare(a)
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function getDirectoryStats(dir: string): Promise<DirectoryStats> {
  let sizeBytes = 0
  let fileCount = 0
  let lastModifiedAt: Date | undefined

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      const nested = await getDirectoryStats(fullPath)
      sizeBytes += nested.sizeBytes
      fileCount += nested.fileCount
      if (nested.lastModifiedAt && (!lastModifiedAt || nested.lastModifiedAt > lastModifiedAt)) {
        lastModifiedAt = nested.lastModifiedAt
      }
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const stat = await fs.stat(fullPath)
    sizeBytes += stat.size
    fileCount += 1
    if (!lastModifiedAt || stat.mtime > lastModifiedAt) {
      lastModifiedAt = stat.mtime
    }
  }

  return { sizeBytes, fileCount, lastModifiedAt }
}

export async function copyOrLinkDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const src = join(sourceDir, entry.name)
    const dst = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyOrLinkDirectory(src, dst)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    try {
      await fs.link(src, dst)
    } catch {
      await fs.copyFile(src, dst)
    }
  }
}

export async function copyOrLinkBlockmaps(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const lowerName = entry.name.toLowerCase()
    if (!lowerName.endsWith('.blockmap')) {
      continue
    }

    const src = join(sourceDir, entry.name)
    const dst = join(targetDir, entry.name)

    try {
      await fs.link(src, dst)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code === 'EEXIST') {
        continue
      }

      await fs.copyFile(src, dst)
    }
  }
}

export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

export function sanitizeFileName(input: string, fieldName: string = 'fileName'): string {
  const fileName = input.trim()
  if (!fileName) throw new BadRequestException(`${fieldName} is required`)
  if (fileName.includes('\0')) throw new BadRequestException(`invalid ${fieldName}`)
  if (fileName.includes('/') || fileName.includes('\\')) throw new BadRequestException(`invalid ${fieldName}`)
  if (fileName === '.' || fileName === '..') throw new BadRequestException(`invalid ${fieldName}`)
  return fileName
}

export function normalizeBackendChannel(input: string): 'testing' | 'stable' {
  const channel = input.trim().toLowerCase()
  if (channel !== 'testing' && channel !== 'stable') {
    throw new BadRequestException('invalid backend channel')
  }
  return channel
}
