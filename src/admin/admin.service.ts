import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'fs'
import { join } from 'path'
import { resolveUpdateStoragePaths } from '../updates/update-paths'
import type { ReleaseDetail, StableChannelState } from './admin.types'

function normalizeVersion(input: string): string {
  return input.trim().replace(/^v/i, '')
}

function validateVersionSafe(version: string): void {
  if (!version) throw new BadRequestException('version is required')
  if (version === '.' || version === '..') throw new BadRequestException('invalid version')
  if (version.includes('\0')) throw new BadRequestException('invalid version')
  if (version.includes('/') || version.includes('\\')) throw new BadRequestException('invalid version')
  if (version.includes('..')) throw new BadRequestException('invalid version')
  if (!/^[0-9a-zA-Z][0-9a-zA-Z.+_-]*$/.test(version)) throw new BadRequestException('invalid version')
}

function parseSemver(version: string): number[] {
  const v = normalizeVersion(version)
  const parts = v.split('.')
  return parts.map((p) => {
    const n = Number(p)
    return Number.isFinite(n) ? n : 0
  })
}

function compareSemverDesc(a: string, b: string): number {
  const ap = parseSemver(a)
  const bp = parseSemver(b)
  const maxLen = Math.max(ap.length, bp.length)

  for (let i = 0; i < maxLen; i += 1) {
    const av = ap[i] ?? 0
    const bv = bp[i] ?? 0
    if (av !== bv) return bv - av
  }

  return b.localeCompare(a)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function getDirectoryStats(
  dir: string
): Promise<{ sizeBytes: number; fileCount: number; lastModifiedAt?: Date }> {
  let sizeBytes = 0
  let fileCount = 0
  let lastModifiedAt: Date | undefined

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const p = join(dir, entry.name)

    if (entry.isDirectory()) {
      const sub = await getDirectoryStats(p)
      sizeBytes += sub.sizeBytes
      fileCount += sub.fileCount
      if (sub.lastModifiedAt && (!lastModifiedAt || sub.lastModifiedAt > lastModifiedAt)) {
        lastModifiedAt = sub.lastModifiedAt
      }
      continue
    }

    if (!entry.isFile()) continue

    const stat = await fs.stat(p)
    sizeBytes += stat.size
    fileCount += 1
    const m = stat.mtime
    if (m && (!lastModifiedAt || m > lastModifiedAt)) {
      lastModifiedAt = m
    }
  }

  return { sizeBytes, fileCount, lastModifiedAt }
}

async function copyOrLinkDirectory(sourceDir: string, targetDir: string): Promise<void> {
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
      // 只同步文件/目录，忽略符号链接等特殊类型（electron-builder 产物一般不会用到）
      continue
    }

    try {
      await fs.link(src, dst)
    } catch {
      await fs.copyFile(src, dst)
    }
  }
}

async function copyOrLinkBlockmaps(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue

    const name = entry.name.toLowerCase()
    if (!name.endsWith('.blockmap')) continue

    const src = join(sourceDir, entry.name)
    const dst = join(targetDir, entry.name)

    try {
      await fs.link(src, dst)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code === 'EEXIST') continue

      await fs.copyFile(src, dst)
    }
  }
}

@Injectable()
export class AdminService {
  private readonly paths = resolveUpdateStoragePaths()

  private async readStableState(): Promise<StableChannelState> {
    try {
      const raw = await fs.readFile(this.paths.stableStateFile, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StableChannelState>
      return {
        currentVersion: parsed.currentVersion,
        previousVersions: Array.isArray(parsed.previousVersions) ? parsed.previousVersions : [],
        updatedAt: parsed.updatedAt
      }
    } catch {
      return {
        previousVersions: []
      }
    }
  }

  private async writeStableState(state: StableChannelState): Promise<void> {
    await fs.mkdir(this.paths.channelsDir, { recursive: true })
    await fs.writeFile(this.paths.stableStateFile, JSON.stringify(state, null, 2), 'utf-8')
  }

  async listReleases(): Promise<{ versions: string[] }> {
    await fs.mkdir(this.paths.releasesDir, { recursive: true })

    const entries = await fs.readdir(this.paths.releasesDir, { withFileTypes: true })
    const versions = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(compareSemverDesc)

    return { versions }
  }

  async listReleaseDetails(): Promise<{ stable: StableChannelState; versions: ReleaseDetail[] }> {
    const stable = await this.readStableState()

    await fs.mkdir(this.paths.releasesDir, { recursive: true })
    const entries = await fs.readdir(this.paths.releasesDir, { withFileTypes: true })

    const versions = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(compareSemverDesc)

    const protectedSet = new Set<string>()
    if (stable.currentVersion) protectedSet.add(normalizeVersion(stable.currentVersion))
    for (const v of stable.previousVersions || []) {
      const n = normalizeVersion(v)
      if (n) protectedSet.add(n)
    }

    const details: ReleaseDetail[] = []
    for (const v of versions) {
      const normalized = normalizeVersion(v)
      const dir = join(this.paths.releasesDir, v)
      const stats = await getDirectoryStats(dir)

      const protectedReasons: string[] = []
      if (stable.currentVersion && normalizeVersion(stable.currentVersion) === normalized) {
        protectedReasons.push('stable current')
      }
      if ((stable.previousVersions || []).some((pv) => normalizeVersion(pv) === normalized)) {
        protectedReasons.push('stable rollback chain')
      }

      details.push({
        version: v,
        sizeBytes: stats.sizeBytes,
        fileCount: stats.fileCount,
        lastModifiedAt: stats.lastModifiedAt ? stats.lastModifiedAt.toISOString() : undefined,
        protected: protectedSet.has(normalized),
        protectedReasons
      })
    }

    return { stable, versions: details }
  }

  async deleteRelease(versionInput: string, options?: { force?: boolean }): Promise<{ ok: true }> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const stable = await this.readStableState()
    const normalizedCurrent = stable.currentVersion ? normalizeVersion(stable.currentVersion) : undefined
    const normalizedPrevious = new Set((stable.previousVersions || []).map((v) => normalizeVersion(v)))

    const protectedReasons: string[] = []
    if (normalizedCurrent && normalizedCurrent === version) protectedReasons.push('stable current')
    if (normalizedPrevious.has(version)) protectedReasons.push('stable rollback chain')

    const force = options?.force === true
    if (protectedReasons.length > 0 && !force) {
      throw new BadRequestException(`release is protected: ${protectedReasons.join(', ')}`)
    }

    const dir = join(this.paths.releasesDir, version)
    if (!(await pathExists(dir))) {
      throw new NotFoundException(`release not found: ${version}`)
    }

    await fs.rm(dir, { recursive: true, force: true })

    if (force && normalizedPrevious.has(version)) {
      const nextState: StableChannelState = {
        ...stable,
        previousVersions: (stable.previousVersions || []).filter((v) => normalizeVersion(v) !== version),
        updatedAt: new Date().toISOString()
      }
      await this.writeStableState(nextState)
    }

    return { ok: true }
  }

  async getChannels(): Promise<{ stable: StableChannelState }> {
    const stable = await this.readStableState()
    return { stable }
  }

  async promoteStable(versionInput: string): Promise<{ stable: StableChannelState }> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const releaseDir = join(this.paths.releasesDir, version)
    if (!(await pathExists(releaseDir))) {
      throw new NotFoundException(`release not found: ${version}`)
    }

    // 先读旧状态，便于维护回滚链
    const previousState = await this.readStableState()

    // 更新 stable 状态（去重、维护 previousVersions）
    const previousVersions = (previousState.previousVersions || []).filter((v) => normalizeVersion(v) !== version)

    const current = previousState.currentVersion ? normalizeVersion(previousState.currentVersion) : undefined
    let nextPrevious = previousVersions

    if (current && current !== version) {
      nextPrevious = [current, ...nextPrevious.filter((v) => normalizeVersion(v) !== current)]
    }

    // 限制历史长度，避免无限增长
    nextPrevious = nextPrevious.slice(0, 20)

    // 清空并重建 stable 目录
    await fs.rm(this.paths.stableDir, { recursive: true, force: true })
    await fs.mkdir(this.paths.stableDir, { recursive: true })

    // 将 releases/<version> 的产物“硬链接/复制”到 channels/stable
    await copyOrLinkDirectory(releaseDir, this.paths.stableDir)

    // 为差分更新保留历史 blockmap（仅保留体积小的 *.blockmap，不保留旧安装包）
    for (const v of nextPrevious) {
      const vNormalized = normalizeVersion(v)
      if (!vNormalized) continue

      const dir = join(this.paths.releasesDir, vNormalized)
      if (!(await pathExists(dir))) continue

      await copyOrLinkBlockmaps(dir, this.paths.stableDir)
    }

    const nextState: StableChannelState = {
      currentVersion: version,
      previousVersions: nextPrevious,
      updatedAt: new Date().toISOString()
    }

    await this.writeStableState(nextState)
    return { stable: nextState }
  }

  async rollbackStable(versionInput?: string): Promise<{ stable: StableChannelState }> {
    if (versionInput && versionInput.trim()) {
      return this.promoteStable(versionInput)
    }

    const state = await this.readStableState()
    const target = state.previousVersions?.[0]
    if (!target) {
      throw new BadRequestException('no previous version to rollback')
    }

    return this.promoteStable(target)
  }
}
