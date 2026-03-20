import { BackendReleasesService } from '../backend-releases/backend-releases.service'
import { BaseSubjectModule } from './base-subject.module'

export class EdgeFarmerWorkerSubjectModule extends BaseSubjectModule {
  readonly subjectId = 'edge_farmer_worker'
  readonly displayName = 'Edge Farmer Worker'
  readonly kind = 'agent' as const
  readonly uploadSlots = ['image', 'checksums']
  readonly capabilities = {
    supportsChannels: true,
    supportsCompatibility: false,
    supportsEnvironmentControl: true,
    supportsDeployments: true,
    supportsStaticDownloads: true
  }

  constructor(private readonly releasesService: BackendReleasesService) {
    super()
  }

  override createUploadSession(body: Record<string, unknown>) {
    return this.releasesService.createUploadSession(String(body.version ?? ''))
  }

  override uploadSessionFile(
    sessionId: string,
    slot: string,
    fileName: string,
    stream: NodeJS.ReadableStream,
    options?: { chunkIndex?: unknown; totalChunks?: unknown; totalSizeBytes?: unknown }
  ) {
    return this.releasesService.uploadSessionFile(sessionId, slot, fileName, stream, options)
  }

  override finalizeUploadSession(sessionId: string, body?: Record<string, unknown>) {
    return this.releasesService.finalizeUploadSession(sessionId, body)
  }

  override listReleases() {
    return this.releasesService.listReleases()
  }

  override listReleaseDetails() {
    return this.releasesService.listReleaseDetails()
  }

  override getRelease(version: string) {
    return this.releasesService.getRelease(version)
  }

  override deleteRelease(version: string, options?: { force?: boolean }) {
    return this.releasesService.deleteRelease(version, options)
  }

  override getChannels() {
    return this.releasesService.getChannels()
  }

  override promoteChannel(channel: string, body?: Record<string, unknown>) {
    return this.releasesService.promoteChannel(channel, String(body?.version ?? ''))
  }

  override rollbackChannel(channel: string, body?: Record<string, unknown>) {
    return this.releasesService.rollbackChannel(
      channel,
      typeof body?.version === 'string' ? body.version : undefined
    )
  }

  override listEnvironments() {
    return this.releasesService.listEnvironments()
  }

  override getEnvironment(environmentId: string) {
    return this.releasesService.getEnvironment(environmentId)
  }

  override getResolvedEnvironment(environmentId: string) {
    return this.releasesService.getResolvedEnvironment(environmentId)
  }

  override upsertEnvironment(
    environmentId: string,
    body?: Record<string, unknown>,
    options?: { actor?: string }
  ) {
    return this.releasesService.upsertEnvironment(environmentId, body, options)
  }

  override createDeployment(body?: Record<string, unknown>) {
    return this.releasesService.createDeployment(body)
  }

  override listDeployments() {
    return this.releasesService.listDeployments()
  }

  override getDeployment(deploymentId: string) {
    return this.releasesService.getDeployment(deploymentId)
  }

  override updateDeployment(deploymentId: string, body?: Record<string, unknown>) {
    return this.releasesService.updateDeployment(deploymentId, body)
  }

  override getNextDeployment(environmentId: string) {
    return this.releasesService.getNextDeployment(environmentId)
  }

  override claimDeployment(deploymentId: string, body?: Record<string, unknown>) {
    return this.releasesService.claimDeployment(deploymentId, body)
  }
}
