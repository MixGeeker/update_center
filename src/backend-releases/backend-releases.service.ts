import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { createWriteStream, promises as fs } from 'fs'
import { basename, join } from 'path'
import { pipeline } from 'stream/promises'
import {
  compareSemverDesc,
  copyOrLinkDirectory,
  getDirectoryStats,
  normalizeBackendChannel,
  normalizeVersion,
  pathExists,
  readJsonFile,
  sanitizeFileName,
  validateVersionSafe,
  writeJsonFile
} from '../common/release-storage.utils'
import { resolveUpdateStoragePaths } from '../updates/update-paths'
import type {
  BackendChannel,
  BackendChannelState,
  BackendCompatibilityPolicy,
  BackendDeploymentRecord,
  BackendEnforceMode,
  BackendMigrationPolicy,
  BackendReleaseDetail,
  BackendReleaseManifest,
  BackendUploadSessionRecord,
  BackendUploadSlot
} from './backend-releases.types'

type FinalizeReleaseBody = {
  channel?: unknown
  imageTag?: unknown
  imageRepository?: unknown
  gitCommit?: unknown
  sourceRef?: unknown
  buildTime?: unknown
  notes?: unknown
  composeProfileSet?: unknown
  migrationPolicy?: unknown
  desktopCompatibility?: unknown
}

type CreateDeploymentBody = {
  channel?: unknown
  version?: unknown
  environmentId?: unknown
  notes?: unknown
}

@Injectable()
export class BackendReleasesService {
  private readonly paths = resolveUpdateStoragePaths()

  async createUploadSession(versionInput: string): Promise<{
    sessionId: string
    version: string
    uploadUrls: Record<BackendUploadSlot, string>
    finalizeUrl: string
  }> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const releaseDir = this.getReleaseDir(version)
    if (await pathExists(releaseDir)) {
      throw new ConflictException(`backend release already exists: ${version}`)
    }

    const sessionId = randomUUID()
    const session: BackendUploadSessionRecord = {
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
      uploadUrls: {
        image: `/api/admin/backend-releases/upload-sessions/${encodeURIComponent(sessionId)}/files/image`,
        checksums: `/api/admin/backend-releases/upload-sessions/${encodeURIComponent(sessionId)}/files/checksums`
      },
      finalizeUrl: `/api/admin/backend-releases/upload-sessions/${encodeURIComponent(sessionId)}/finalize`
    }
  }

  async uploadSessionFile(
    sessionId: string,
    slotInput: string,
    fileNameInput: string,
    stream: NodeJS.ReadableStream
  ): Promise<{
    sessionId: string
    slot: BackendUploadSlot
    fileName: string
    sizeBytes: number
    sha256: string
  }> {
    const slot = this.normalizeUploadSlot(slotInput)
    const fileName = sanitizeFileName(fileNameInput)
    const session = await this.readSession(sessionId)
    const sessionDir = this.getSessionDir(sessionId)
    const storedFileName = `${slot}__${fileName}`
    const targetPath = join(sessionDir, storedFileName)

    await fs.mkdir(sessionDir, { recursive: true })
    await fs.rm(targetPath, { force: true })

    const hasher = createHash('sha256')
    let sizeBytes = 0
    stream.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      hasher.update(buffer)
      sizeBytes += buffer.length
    })

    await pipeline(stream, createWriteStream(targetPath))

    const uploaded: BackendUploadSessionRecord['files'][BackendUploadSlot] = {
      slot,
      fileName,
      storedFileName,
      sizeBytes,
      sha256: hasher.digest('hex'),
      uploadedAt: new Date().toISOString()
    }

    const nextSession: BackendUploadSessionRecord = {
      ...session,
      files: {
        ...session.files,
        [slot]: uploaded
      }
    }

    await this.writeSession(nextSession)

    return {
      sessionId,
      slot,
      fileName,
      sizeBytes,
      sha256: uploaded.sha256
    }
  }

  async finalizeUploadSession(
    sessionId: string,
    body: FinalizeReleaseBody | undefined
  ): Promise<{
    release: BackendReleaseDetail
    channels: { testing: BackendChannelState; stable: BackendChannelState }
  }> {
    const session = await this.readSession(sessionId)
    const image = session.files.image
    if (!image) {
      throw new BadRequestException('image file is required before finalize')
    }

    const version = session.version
    const releaseDir = this.getReleaseDir(version)
    if (await pathExists(releaseDir)) {
      throw new ConflictException(`backend release already exists: ${version}`)
    }

    const channelHint = this.normalizeChannelHint(body?.channel)
    const compatibility = await this.normalizeCompatibility(version, body?.desktopCompatibility)
    if (channelHint === 'stable' && !compatibility) {
      throw new BadRequestException('stable backend release requires desktop compatibility mapping')
    }

    const manifest: BackendReleaseManifest = {
      schemaVersion: 1,
      service: 'local_server',
      version,
      uploadedAt: new Date().toISOString(),
      channelHint,
      image: {
        fileName: image.fileName,
        sha256: image.sha256,
        sizeBytes: image.sizeBytes,
        tag: this.normalizeOptionalString(body?.imageTag),
        repository: this.normalizeOptionalString(body?.imageRepository),
        platform: 'linux/arm64'
      },
      checksums: session.files.checksums
        ? {
            fileName: session.files.checksums.fileName,
            sha256: session.files.checksums.sha256,
            sizeBytes: session.files.checksums.sizeBytes
          }
        : undefined,
      source: {
        gitCommit: this.normalizeOptionalString(body?.gitCommit),
        refName: this.normalizeOptionalString(body?.sourceRef),
        buildTime: this.normalizeOptionalString(body?.buildTime)
      },
      composeProfileSet: this.normalizeProfileSet(body?.composeProfileSet),
      migrationPolicy: this.normalizeMigrationPolicy(body?.migrationPolicy),
      notes: this.normalizeOptionalString(body?.notes)
    }

    await fs.mkdir(releaseDir, { recursive: true })

    try {
      await this.copySessionFileToRelease(sessionId, image.storedFileName, join(releaseDir, image.fileName))

      if (session.files.checksums) {
        await this.copySessionFileToRelease(
          sessionId,
          session.files.checksums.storedFileName,
          join(releaseDir, session.files.checksums.fileName)
        )
      }

      const manifestPath = join(releaseDir, 'release-manifest.json')
      await writeJsonFile(manifestPath, manifest)

      if (!session.files.checksums) {
        const lines = [`${manifest.image.sha256}  ${manifest.image.fileName}`]
        lines.push(`${await this.hashFile(manifestPath)}  ${basename(manifestPath)}`)
        await fs.writeFile(join(releaseDir, 'checksums.txt'), `${lines.join('\n')}\n`, 'utf-8')
      }

      if (compatibility) {
        await this.writeCompatibility(compatibility)
      }

      if (channelHint === 'testing' || channelHint === 'stable') {
        await this.promoteChannel(channelHint, version)
      }
    } catch (error) {
      await fs.rm(releaseDir, { recursive: true, force: true })
      throw error
    }

    await this.cleanupSession(sessionId)

    return {
      release: await this.getRelease(version),
      channels: await this.getChannels()
    }
  }

  async listReleases(): Promise<{ versions: string[] }> {
    await fs.mkdir(this.paths.backendReleasesDir, { recursive: true })
    const entries = await fs.readdir(this.paths.backendReleasesDir, { withFileTypes: true })
    const versions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareSemverDesc)
    return { versions }
  }

  async listReleaseDetails(): Promise<{
    channels: { testing: BackendChannelState; stable: BackendChannelState }
    versions: BackendReleaseDetail[]
  }> {
    const channels = await this.getChannels()
    const { versions } = await this.listReleases()

    const details: BackendReleaseDetail[] = []
    for (const version of versions) {
      details.push(await this.buildReleaseDetail(version, channels.testing, channels.stable))
    }

    return { channels, versions: details }
  }

  async getRelease(versionInput: string): Promise<BackendReleaseDetail> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)
    const channels = await this.getChannels()
    return this.buildReleaseDetail(version, channels.testing, channels.stable)
  }

  async deleteRelease(versionInput: string, options?: { force?: boolean }): Promise<{ ok: true }> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const channels = await this.getChannels()
    const protectedReasons = this.getProtectedReasons(version, channels.testing, channels.stable)
    const force = options?.force === true

    if (protectedReasons.includes('testing current') || protectedReasons.includes('stable current')) {
      throw new BadRequestException('cannot delete currently active backend release')
    }

    if (protectedReasons.length > 0 && !force) {
      throw new BadRequestException(`backend release is protected: ${protectedReasons.join(', ')}`)
    }

    const releaseDir = this.getReleaseDir(version)
    if (!(await pathExists(releaseDir))) {
      throw new NotFoundException(`backend release not found: ${version}`)
    }

    await fs.rm(releaseDir, { recursive: true, force: true })
    await fs.rm(this.getCompatibilityFile(version), { force: true })

    if (force) {
      await this.removeVersionFromRollbackChain('testing', version)
      await this.removeVersionFromRollbackChain('stable', version)
    }

    return { ok: true }
  }

  async getChannels(): Promise<{ testing: BackendChannelState; stable: BackendChannelState }> {
    const [testing, stable] = await Promise.all([
      this.readChannelState('testing'),
      this.readChannelState('stable')
    ])

    return { testing, stable }
  }

  async promoteChannel(channelInput: string, versionInput: string): Promise<{ testing: BackendChannelState; stable: BackendChannelState }> {
    const channel = normalizeBackendChannel(channelInput)
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const releaseDir = this.getReleaseDir(version)
    if (!(await pathExists(releaseDir))) {
      throw new NotFoundException(`backend release not found: ${version}`)
    }

    if (channel === 'stable' && !(await pathExists(this.getCompatibilityFile(version)))) {
      throw new BadRequestException('stable backend release requires desktop compatibility mapping')
    }

    const previousState = await this.readChannelState(channel)
    const currentVersion = previousState.currentVersion ? normalizeVersion(previousState.currentVersion) : undefined
    let previousVersions = (previousState.previousVersions || []).filter(
      (item) => normalizeVersion(item) !== version
    )

    if (currentVersion && currentVersion !== version) {
      previousVersions = [currentVersion, ...previousVersions.filter((item) => normalizeVersion(item) !== currentVersion)]
    }

    previousVersions = previousVersions.slice(0, 20)

    const channelDir = this.getChannelDir(channel)
    await fs.rm(channelDir, { recursive: true, force: true })
    await fs.mkdir(channelDir, { recursive: true })
    await copyOrLinkDirectory(releaseDir, channelDir)

    const nextState: BackendChannelState = {
      currentVersion: version,
      previousVersions,
      updatedAt: new Date().toISOString()
    }

    await this.writeChannelState(channel, nextState)
    return this.getChannels()
  }

  async rollbackChannel(channelInput: string, versionInput?: string): Promise<{ testing: BackendChannelState; stable: BackendChannelState }> {
    const channel = normalizeBackendChannel(channelInput)
    if (versionInput && versionInput.trim()) {
      return this.promoteChannel(channel, versionInput)
    }

    const state = await this.readChannelState(channel)
    const target = state.previousVersions?.[0]
    if (!target) {
      throw new BadRequestException(`no previous backend ${channel} version to rollback`)
    }

    return this.promoteChannel(channel, target)
  }

  async upsertCompatibility(versionInput: string, input: unknown): Promise<BackendCompatibilityPolicy> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const releaseDir = this.getReleaseDir(version)
    if (!(await pathExists(releaseDir))) {
      throw new NotFoundException(`backend release not found: ${version}`)
    }

    const compatibility = await this.normalizeCompatibility(version, input)
    if (!compatibility) {
      throw new BadRequestException('desktop compatibility is required')
    }

    await this.writeCompatibility(compatibility)
    return compatibility
  }

  async getCompatibility(versionInput: string): Promise<BackendCompatibilityPolicy> {
    const version = normalizeVersion(versionInput)
    validateVersionSafe(version)

    const compatibility = await readJsonFile<BackendCompatibilityPolicy>(this.getCompatibilityFile(version))
    if (!compatibility) {
      throw new NotFoundException(`backend compatibility not found: ${version}`)
    }

    return compatibility
  }

  async getActiveCompatibility(): Promise<{
    stableCurrentVersion?: string
    compatibility?: BackendCompatibilityPolicy
  }> {
    const stable = await this.readChannelState('stable')
    if (!stable.currentVersion) {
      return {}
    }

    return {
      stableCurrentVersion: stable.currentVersion,
      compatibility: await readJsonFile<BackendCompatibilityPolicy>(
        this.getCompatibilityFile(stable.currentVersion)
      )
    }
  }

  async createDeployment(body: CreateDeploymentBody | undefined): Promise<BackendDeploymentRecord> {
    const channel = normalizeBackendChannel(this.normalizeOptionalString(body?.channel) || 'stable')
    const state = await this.readChannelState(channel)
    const explicitVersion = this.normalizeOptionalString(body?.version)
    const requestedVersion = normalizeVersion(explicitVersion || state.currentVersion || '')
    validateVersionSafe(requestedVersion)

    if (!(await pathExists(this.getReleaseDir(requestedVersion)))) {
      throw new NotFoundException(`backend release not found: ${requestedVersion}`)
    }

    const deploymentId = randomUUID()
    const now = new Date().toISOString()
    const compatibility = await readJsonFile<BackendCompatibilityPolicy>(this.getCompatibilityFile(requestedVersion))
    const record: BackendDeploymentRecord = {
      schemaVersion: 1,
      deploymentId,
      environmentId: this.normalizeOptionalString(body?.environmentId) || 'mac-prod',
      channel,
      requestedVersion,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      notes: this.normalizeOptionalString(body?.notes),
      compatibility: compatibility || undefined
    }

    await writeJsonFile(this.getDeploymentFile(deploymentId), record)
    return record
  }

  async listDeployments(): Promise<{ deployments: BackendDeploymentRecord[] }> {
    await fs.mkdir(this.paths.backendDeploymentsDir, { recursive: true })
    const entries = await fs.readdir(this.paths.backendDeploymentsDir, { withFileTypes: true })
    const deployments: BackendDeploymentRecord[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }

      const record = await readJsonFile<BackendDeploymentRecord>(join(this.paths.backendDeploymentsDir, entry.name))
      if (record) {
        deployments.push(record)
      }
    }

    deployments.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { deployments }
  }

  async getDeployment(deploymentIdInput: string): Promise<BackendDeploymentRecord> {
    const deploymentId = sanitizeFileName(deploymentIdInput, 'deploymentId')
    const record = await readJsonFile<BackendDeploymentRecord>(this.getDeploymentFile(deploymentId))
    if (!record) {
      throw new NotFoundException(`backend deployment not found: ${deploymentId}`)
    }
    return record
  }

  private normalizeUploadSlot(slotInput: string): BackendUploadSlot {
    const slot = slotInput.trim().toLowerCase()
    if (slot !== 'image' && slot !== 'checksums') {
      throw new BadRequestException('invalid backend upload slot')
    }
    return slot
  }

  private async readSession(sessionId: string): Promise<BackendUploadSessionRecord> {
    const session = await readJsonFile<BackendUploadSessionRecord>(this.getSessionFile(sessionId))
    if (!session) {
      throw new NotFoundException(`backend upload session not found: ${sessionId}`)
    }
    return session
  }

  private async writeSession(session: BackendUploadSessionRecord): Promise<void> {
    await writeJsonFile(this.getSessionFile(session.sessionId), session)
  }

  private getSessionFile(sessionId: string): string {
    return join(this.paths.backendUploadSessionsDir, `${sanitizeFileName(sessionId, 'sessionId')}.json`)
  }

  private getSessionDir(sessionId: string): string {
    return join(this.paths.backendUploadSessionsDir, sanitizeFileName(sessionId, 'sessionId'))
  }

  private getDeploymentFile(deploymentId: string): string {
    return join(this.paths.backendDeploymentsDir, `${sanitizeFileName(deploymentId, 'deploymentId')}.json`)
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    await fs.rm(this.getSessionFile(sessionId), { force: true })
    await fs.rm(this.getSessionDir(sessionId), { recursive: true, force: true })
  }

  private getReleaseDir(version: string): string {
    return join(this.paths.backendReleasesDir, version)
  }

  private getChannelDir(channel: BackendChannel): string {
    return channel === 'testing' ? this.paths.backendTestingDir : this.paths.backendStableDir
  }

  private getChannelStateFile(channel: BackendChannel): string {
    return channel === 'testing' ? this.paths.backendTestingStateFile : this.paths.backendStableStateFile
  }

  private getCompatibilityFile(version: string): string {
    return join(this.paths.backendCompatibilityDir, `${version}.json`)
  }

  private async readChannelState(channel: BackendChannel): Promise<BackendChannelState> {
    const parsed = await readJsonFile<Partial<BackendChannelState>>(this.getChannelStateFile(channel))
    if (!parsed) {
      return { previousVersions: [] }
    }

    return {
      currentVersion: parsed.currentVersion,
      previousVersions: Array.isArray(parsed.previousVersions) ? parsed.previousVersions : [],
      updatedAt: parsed.updatedAt
    }
  }

  private async writeChannelState(channel: BackendChannel, state: BackendChannelState): Promise<void> {
    await writeJsonFile(this.getChannelStateFile(channel), state)
  }

  private async removeVersionFromRollbackChain(channel: BackendChannel, version: string): Promise<void> {
    const state = await this.readChannelState(channel)
    const nextState: BackendChannelState = {
      ...state,
      previousVersions: (state.previousVersions || []).filter((item) => normalizeVersion(item) !== version),
      updatedAt: new Date().toISOString()
    }
    await this.writeChannelState(channel, nextState)
  }

  private getProtectedReasons(
    version: string,
    testing: BackendChannelState,
    stable: BackendChannelState
  ): string[] {
    const reasons: string[] = []
    if (testing.currentVersion && normalizeVersion(testing.currentVersion) === version) {
      reasons.push('testing current')
    }
    if ((testing.previousVersions || []).some((item) => normalizeVersion(item) === version)) {
      reasons.push('testing rollback chain')
    }
    if (stable.currentVersion && normalizeVersion(stable.currentVersion) === version) {
      reasons.push('stable current')
    }
    if ((stable.previousVersions || []).some((item) => normalizeVersion(item) === version)) {
      reasons.push('stable rollback chain')
    }
    return reasons
  }

  private async buildReleaseDetail(
    version: string,
    testing: BackendChannelState,
    stable: BackendChannelState
  ): Promise<BackendReleaseDetail> {
    const releaseDir = this.getReleaseDir(version)
    if (!(await pathExists(releaseDir))) {
      throw new NotFoundException(`backend release not found: ${version}`)
    }

    const stats = await getDirectoryStats(releaseDir)
    const manifest = await readJsonFile<BackendReleaseManifest>(join(releaseDir, 'release-manifest.json'))
    const channels: BackendChannel[] = []
    if (testing.currentVersion && normalizeVersion(testing.currentVersion) === normalizeVersion(version)) {
      channels.push('testing')
    }
    if (stable.currentVersion && normalizeVersion(stable.currentVersion) === normalizeVersion(version)) {
      channels.push('stable')
    }

    const protectedReasons = this.getProtectedReasons(normalizeVersion(version), testing, stable)

    return {
      version,
      sizeBytes: stats.sizeBytes,
      fileCount: stats.fileCount,
      lastModifiedAt: stats.lastModifiedAt?.toISOString(),
      channels,
      protected: protectedReasons.length > 0,
      protectedReasons,
      hasCompatibility: await pathExists(this.getCompatibilityFile(version)),
      manifest: manifest || undefined
    }
  }

  private normalizeChannelHint(input: unknown): 'draft' | BackendChannel {
    const value = this.normalizeOptionalString(input)?.toLowerCase()
    if (!value || value === 'draft') {
      return 'draft'
    }

    if (value === 'testing' || value === 'stable') {
      return value
    }

    throw new BadRequestException('invalid backend channel hint')
  }

  private normalizeProfileSet(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return []
    }

    return input
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item, index, list) => item && list.indexOf(item) === index)
  }

  private normalizeMigrationPolicy(input: unknown): BackendMigrationPolicy {
    const value = this.normalizeOptionalString(input)?.toLowerCase()
    if (!value || value === 'none') {
      return 'none'
    }

    if (value === 'before-deploy' || value === 'after-deploy') {
      return value
    }

    throw new BadRequestException('invalid migrationPolicy')
  }

  private normalizeOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') {
      return undefined
    }

    const normalized = input.trim()
    return normalized || undefined
  }

  private normalizeEnforceMode(input: unknown): BackendEnforceMode {
    const value = this.normalizeOptionalString(input)?.toLowerCase()
    if (!value || value === 'none') {
      return 'none'
    }

    if (value === 'warn' || value === 'hard_block') {
      return value
    }

    throw new BadRequestException('invalid desktop compatibility enforceMode')
  }

  private async normalizeCompatibility(
    version: string,
    input: unknown
  ): Promise<BackendCompatibilityPolicy | undefined> {
    if (!input || typeof input !== 'object') {
      return undefined
    }

    const candidate = input as Record<string, unknown>
    const desktopMinVersion = normalizeVersion(this.normalizeRequiredVersion(candidate.desktopMinVersion, 'desktopMinVersion'))
    const desktopRecommendedVersion = normalizeVersion(
      this.normalizeRequiredVersion(candidate.desktopRecommendedVersion, 'desktopRecommendedVersion')
    )
    const desktopMaxVersionRaw = this.normalizeOptionalString(candidate.desktopMaxVersion)
    const desktopMaxVersion = desktopMaxVersionRaw ? normalizeVersion(desktopMaxVersionRaw) : undefined

    if (desktopMaxVersion) {
      validateVersionSafe(desktopMaxVersion, 'desktopMaxVersion')
    }

    if (!(await this.desktopReleaseExists(desktopRecommendedVersion))) {
      throw new BadRequestException(
        `desktop recommended version not found in update center: ${desktopRecommendedVersion}`
      )
    }

    return {
      schemaVersion: 1,
      backendVersion: version,
      desktopMinVersion,
      desktopRecommendedVersion,
      desktopMaxVersion,
      enforceMode: this.normalizeEnforceMode(candidate.enforceMode),
      notes: this.normalizeOptionalString(candidate.notes),
      updatedAt: new Date().toISOString()
    }
  }

  private normalizeRequiredVersion(input: unknown, fieldName: string): string {
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException(`${fieldName} is required`)
    }

    const normalized = normalizeVersion(input)
    validateVersionSafe(normalized, fieldName)
    return normalized
  }

  private async desktopReleaseExists(version: string): Promise<boolean> {
    if (await pathExists(join(this.paths.releasesDir, version))) {
      return true
    }

    const stableState = await readJsonFile<{ currentVersion?: string }>(this.paths.stableStateFile)
    return normalizeVersion(stableState?.currentVersion || '') === version
  }

  private async writeCompatibility(policy: BackendCompatibilityPolicy): Promise<void> {
    await writeJsonFile(this.getCompatibilityFile(policy.backendVersion), policy)
  }

  private async copySessionFileToRelease(sessionId: string, storedFileName: string, targetPath: string): Promise<void> {
    const sourcePath = join(this.getSessionDir(sessionId), storedFileName)
    if (!(await pathExists(sourcePath))) {
      throw new NotFoundException(`uploaded backend artifact not found: ${storedFileName}`)
    }

    await fs.copyFile(sourcePath, targetPath)
  }

  private async hashFile(path: string): Promise<string> {
    const content = await fs.readFile(path)
    return createHash('sha256').update(content).digest('hex')
  }
}
