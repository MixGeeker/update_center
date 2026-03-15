import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  compareSemverDesc,
  copyOrLinkBlockmaps,
  copyOrLinkDirectory,
  getDirectoryStats,
  normalizeVersion,
  pathExists,
  readJsonFile,
  validateVersionSafe,
  writeJsonFile
} from '../common/release-storage.utils'
import { resolveUpdateStoragePaths } from '../updates/update-paths'
import type { ReleaseDetail, StableChannelState } from './admin.types'

@Injectable()
export class AdminService {
  private readonly paths = resolveUpdateStoragePaths()

  private async readStableState(): Promise<StableChannelState> {
    const parsed = await readJsonFile<Partial<StableChannelState>>(this.paths.stableStateFile)
    if (!parsed) {
      return { previousVersions: [] }
    }

    return {
      currentVersion: parsed.currentVersion,
      previousVersions: Array.isArray(parsed.previousVersions) ? parsed.previousVersions : [],
      updatedAt: parsed.updatedAt
    }
  }

  private async writeStableState(state: StableChannelState): Promise<void> {
    await writeJsonFile(this.paths.stableStateFile, state)
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
