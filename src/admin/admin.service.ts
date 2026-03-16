import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { createReadStream, createWriteStream, promises as fs } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import {
  compareSemverDesc,
  copyOrLinkBlockmaps,
  copyOrLinkDirectory,
  getDirectoryStats,
  normalizeVersion,
  pathExists,
  readJsonFile,
  sanitizeFileName,
  validateVersionSafe,
  writeJsonFile
} from '../common/release-storage.utils'
import { resolveUpdateStoragePaths } from '../updates/update-paths'
import type { DesktopUploadSessionRecord, ReleaseDetail, StableChannelState } from './admin.types'

type UploadSessionFileOptions = {
  chunkIndex?: unknown
  totalChunks?: unknown
  totalSizeBytes?: unknown
}

type NormalizedChunkUploadOptions =
  | { enabled: false }
  | {
      enabled: true
      chunkIndex: number
      totalChunks: number
      totalSizeBytes?: number
    }

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

  async createUploadSession(versionInput: string): Promise<{
    sessionId: string
    version: string
    uploadUrl: string
    finalizeUrl: string
  }> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const sessionId = randomUUID()
    const session: DesktopUploadSessionRecord = {
      schemaVersion: 1,
      sessionId,
      version,
      createdAt: new Date().toISOString(),
      files: {}
    }

    await fs.mkdir(this.getSessionDir(sessionId), { recursive: true })
    await this.writeSession(session)

    return {
      sessionId,
      version,
      uploadUrl: `/api/admin/releases/upload-sessions/${encodeURIComponent(sessionId)}/files`,
      finalizeUrl: `/api/admin/releases/upload-sessions/${encodeURIComponent(sessionId)}/finalize`
    }
  }

  async uploadSessionFile(
    sessionId: string,
    fileNameInput: string,
    stream: NodeJS.ReadableStream,
    options?: UploadSessionFileOptions
  ): Promise<{
    sessionId: string
    fileName: string
    sizeBytes: number
    sha256?: string
    completed: boolean
    chunkIndex?: number
    totalChunks?: number
  }> {
    const fileName = sanitizeFileName(fileNameInput)
    const normalizedOptions = this.normalizeChunkUploadOptions(options)

    if (normalizedOptions.enabled) {
      return this.uploadSessionFileChunked(sessionId, fileName, stream, normalizedOptions)
    }

    return this.uploadSessionFileSingle(sessionId, fileName, stream)
  }

  async finalizeUploadSession(sessionId: string): Promise<{
    version: string
    fileCount: number
    uploadedFiles: string[]
  }> {
    const session = await this.readSession(sessionId)
    const releaseDir = join(this.paths.releasesDir, session.version)
    const uploadedFiles = Object.values(session.files)

    if (uploadedFiles.length === 0) {
      throw new BadRequestException('at least one uploaded file is required before finalize')
    }

    if (session.chunkUploads && Object.keys(session.chunkUploads).length > 0) {
      throw new BadRequestException('cannot finalize while chunk uploads are incomplete')
    }

    await fs.mkdir(releaseDir, { recursive: true })

    for (const uploaded of uploadedFiles) {
      const sourcePath = join(this.getSessionDir(sessionId), uploaded.storedFileName)
      if (!(await pathExists(sourcePath))) {
        throw new NotFoundException(`uploaded desktop artifact not found: ${uploaded.fileName}`)
      }

      await fs.copyFile(sourcePath, join(releaseDir, uploaded.fileName))
    }

    await this.cleanupSession(sessionId)

    return {
      version: session.version,
      fileCount: uploadedFiles.length,
      uploadedFiles: uploadedFiles.map((item) => item.fileName).sort((a, b) => a.localeCompare(b))
    }
  }

  private async uploadSessionFileSingle(
    sessionId: string,
    fileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{
    sessionId: string
    fileName: string
    sizeBytes: number
    sha256: string
    completed: true
  }> {
    const session = await this.readSession(sessionId)
    const sessionDir = this.getSessionDir(sessionId)
    const storedFileName = fileName
    const targetPath = join(sessionDir, storedFileName)

    await fs.mkdir(sessionDir, { recursive: true })
    await this.cleanupSessionFileArtifacts(sessionDir, session, fileName, storedFileName)

    const hasher = createHash('sha256')
    let sizeBytes = 0
    stream.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      hasher.update(buffer)
      sizeBytes += buffer.length
    })

    await pipeline(stream, createWriteStream(targetPath))

    const uploaded = {
      fileName,
      storedFileName,
      sizeBytes,
      sha256: hasher.digest('hex'),
      uploadedAt: new Date().toISOString(),
      uploadMode: 'single' as const,
      chunkCount: 1
    }

    const nextSession: DesktopUploadSessionRecord = {
      ...session,
      files: {
        ...session.files,
        [fileName]: uploaded
      },
      chunkUploads: this.removeChunkUploadState(session.chunkUploads, fileName)
    }

    await this.writeSession(nextSession)

    return {
      sessionId,
      fileName,
      sizeBytes,
      sha256: uploaded.sha256,
      completed: true
    }
  }

  private async uploadSessionFileChunked(
    sessionId: string,
    fileName: string,
    stream: NodeJS.ReadableStream,
    options: Extract<NormalizedChunkUploadOptions, { enabled: true }>
  ): Promise<{
    sessionId: string
    fileName: string
    sizeBytes: number
    sha256?: string
    completed: boolean
    chunkIndex: number
    totalChunks: number
  }> {
    const session = await this.readSession(sessionId)
    const sessionDir = this.getSessionDir(sessionId)
    const storedFileName = fileName
    const tempStoredFileName = `${storedFileName}.part`
    const targetPath = join(sessionDir, storedFileName)
    const tempPath = join(sessionDir, tempStoredFileName)
    const existingProgress = session.chunkUploads?.[fileName]

    await fs.mkdir(sessionDir, { recursive: true })

    if (options.chunkIndex === 0) {
      await this.cleanupSessionFileArtifacts(sessionDir, session, fileName, storedFileName)
    } else {
      if (!existingProgress) {
        throw new BadRequestException(`missing chunk upload progress for file ${fileName}; restart from chunk 0`)
      }

      if (
        existingProgress.fileName !== fileName ||
        existingProgress.storedFileName !== storedFileName ||
        existingProgress.totalChunks !== options.totalChunks
      ) {
        throw new BadRequestException('chunk upload metadata mismatch; restart from chunk 0')
      }

      if (existingProgress.nextChunkIndex !== options.chunkIndex) {
        throw new BadRequestException(
          `unexpected chunk index ${options.chunkIndex}; expected ${existingProgress.nextChunkIndex}`
        )
      }

      if (
        typeof existingProgress.totalSizeBytes === 'number' &&
        typeof options.totalSizeBytes === 'number' &&
        existingProgress.totalSizeBytes !== options.totalSizeBytes
      ) {
        throw new BadRequestException('chunk upload size mismatch; restart from chunk 0')
      }
    }

    const receivedBytesBefore = options.chunkIndex === 0 ? 0 : (existingProgress?.receivedBytes ?? 0)
    let chunkSizeBytes = 0
    stream.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunkSizeBytes += buffer.length
    })

    await pipeline(stream, createWriteStream(tempPath, { flags: 'a' }))

    const receivedBytes = receivedBytesBefore + chunkSizeBytes
    if (typeof options.totalSizeBytes === 'number' && receivedBytes > options.totalSizeBytes) {
      throw new BadRequestException('received chunk bytes exceed declared totalSizeBytes')
    }

    if (options.chunkIndex + 1 < options.totalChunks) {
      const nextSession: DesktopUploadSessionRecord = {
        ...session,
        chunkUploads: {
          ...(session.chunkUploads || {}),
          [fileName]: {
            fileName,
            storedFileName,
            tempStoredFileName,
            totalChunks: options.totalChunks,
            nextChunkIndex: options.chunkIndex + 1,
            receivedBytes,
            totalSizeBytes: options.totalSizeBytes,
            updatedAt: new Date().toISOString()
          }
        }
      }

      await this.writeSession(nextSession)

      return {
        sessionId,
        fileName,
        sizeBytes: receivedBytes,
        completed: false,
        chunkIndex: options.chunkIndex,
        totalChunks: options.totalChunks
      }
    }

    if (typeof options.totalSizeBytes === 'number' && receivedBytes !== options.totalSizeBytes) {
      throw new BadRequestException('received file size does not match declared totalSizeBytes')
    }

    await fs.rm(targetPath, { force: true })
    await fs.rename(tempPath, targetPath)

    const uploaded = {
      fileName,
      storedFileName,
      sizeBytes: receivedBytes,
      sha256: await this.hashFile(targetPath),
      uploadedAt: new Date().toISOString(),
      uploadMode: 'chunked' as const,
      chunkCount: options.totalChunks
    }

    const nextSession: DesktopUploadSessionRecord = {
      ...session,
      files: {
        ...session.files,
        [fileName]: uploaded
      },
      chunkUploads: this.removeChunkUploadState(session.chunkUploads, fileName)
    }

    await this.writeSession(nextSession)

    return {
      sessionId,
      fileName,
      sizeBytes: receivedBytes,
      sha256: uploaded.sha256,
      completed: true,
      chunkIndex: options.chunkIndex,
      totalChunks: options.totalChunks
    }
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

  private normalizeChunkUploadOptions(input?: UploadSessionFileOptions): NormalizedChunkUploadOptions {
    const hasChunkFields =
      input?.chunkIndex !== undefined || input?.totalChunks !== undefined || input?.totalSizeBytes !== undefined

    if (!hasChunkFields) {
      return { enabled: false }
    }

    const chunkIndex = this.normalizeIntegerField(input?.chunkIndex, 'chunkIndex', { min: 0 })
    const totalChunks = this.normalizeIntegerField(input?.totalChunks, 'totalChunks', { min: 1 })
    if (chunkIndex >= totalChunks) {
      throw new BadRequestException('chunkIndex must be less than totalChunks')
    }

    const totalSizeBytes =
      input?.totalSizeBytes === undefined
        ? undefined
        : this.normalizeIntegerField(input.totalSizeBytes, 'totalSizeBytes', { min: 1 })

    return {
      enabled: true,
      chunkIndex,
      totalChunks,
      totalSizeBytes
    }
  }

  private normalizeIntegerField(input: unknown, fieldName: string, options: { min: number }): number {
    const value = typeof input === 'number' ? input : Number(String(input ?? '').trim())
    if (!Number.isInteger(value) || value < options.min) {
      throw new BadRequestException(`${fieldName} must be an integer >= ${options.min}`)
    }
    return value
  }

  private async readSession(sessionId: string): Promise<DesktopUploadSessionRecord> {
    const session = await readJsonFile<DesktopUploadSessionRecord>(this.getSessionFile(sessionId))
    if (!session) {
      throw new NotFoundException(`desktop upload session not found: ${sessionId}`)
    }

    return {
      ...session,
      files: session.files || {},
      chunkUploads: session.chunkUploads
    }
  }

  private async writeSession(session: DesktopUploadSessionRecord): Promise<void> {
    await writeJsonFile(this.getSessionFile(session.sessionId), session)
  }

  private getSessionFile(sessionId: string): string {
    return join(this.paths.desktopUploadSessionsDir, `${sanitizeFileName(sessionId, 'sessionId')}.json`)
  }

  private getSessionDir(sessionId: string): string {
    return join(this.paths.desktopUploadSessionsDir, sanitizeFileName(sessionId, 'sessionId'))
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    await fs.rm(this.getSessionFile(sessionId), { force: true })
    await fs.rm(this.getSessionDir(sessionId), { recursive: true, force: true })
  }

  private removeChunkUploadState(
    states: DesktopUploadSessionRecord['chunkUploads'],
    fileName: string
  ): DesktopUploadSessionRecord['chunkUploads'] {
    if (!states || !states[fileName]) {
      return states
    }

    const nextStates = { ...states }
    delete nextStates[fileName]
    return Object.keys(nextStates).length > 0 ? nextStates : undefined
  }

  private async cleanupSessionFileArtifacts(
    sessionDir: string,
    session: DesktopUploadSessionRecord,
    fileName: string,
    nextStoredFileName: string
  ): Promise<void> {
    const paths = new Set<string>()
    const currentUploaded = session.files[fileName]
    const currentChunkUpload = session.chunkUploads?.[fileName]

    if (currentUploaded?.storedFileName) {
      paths.add(join(sessionDir, currentUploaded.storedFileName))
    }

    if (currentChunkUpload?.storedFileName) {
      paths.add(join(sessionDir, currentChunkUpload.storedFileName))
    }

    if (currentChunkUpload?.tempStoredFileName) {
      paths.add(join(sessionDir, currentChunkUpload.tempStoredFileName))
    }

    paths.add(join(sessionDir, nextStoredFileName))
    paths.add(join(sessionDir, `${nextStoredFileName}.part`))

    for (const path of paths) {
      await fs.rm(path, { force: true })
    }
  }

  private async hashFile(path: string): Promise<string> {
    const hasher = createHash('sha256')
    for await (const chunk of createReadStream(path)) {
      hasher.update(chunk)
    }
    return hasher.digest('hex')
  }
}
