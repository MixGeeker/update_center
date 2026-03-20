import { BadRequestException } from '@nestjs/common'
import { AdminService } from '../admin/admin.service'
import { BaseSubjectModule } from './base-subject.module'

export class DesktopAppSubjectModule extends BaseSubjectModule {
  readonly subjectId = 'desktop_app'
  readonly displayName = 'Desktop App'
  readonly kind = 'desktop' as const
  readonly uploadSlots = ['artifact']
  readonly capabilities = {
    supportsChannels: true,
    supportsCompatibility: false,
    supportsEnvironmentControl: false,
    supportsDeployments: false,
    supportsStaticDownloads: true
  }

  constructor(private readonly adminService: AdminService) {
    super()
  }

  override createUploadSession(body: Record<string, unknown>) {
    return this.adminService.createUploadSession(String(body.version ?? ''))
  }

  override uploadSessionFile(
    sessionId: string,
    _slot: string,
    fileName: string,
    stream: NodeJS.ReadableStream,
    options?: { chunkIndex?: unknown; totalChunks?: unknown; totalSizeBytes?: unknown }
  ) {
    return this.adminService.uploadSessionFile(sessionId, fileName, stream, options)
  }

  override finalizeUploadSession(sessionId: string) {
    return this.adminService.finalizeUploadSession(sessionId)
  }

  override listReleases() {
    return this.adminService.listReleases()
  }

  override listReleaseDetails() {
    return this.adminService.listReleaseDetails()
  }

  override getRelease(version: string) {
    const normalizedVersion = String(version || '').trim()
    if (!normalizedVersion) {
      throw new BadRequestException('version is required')
    }

    return this.adminService.listReleaseDetails().then((payload) => {
      const matched = payload.versions.find((item) => item.version === normalizedVersion)
      if (!matched) {
        throw new BadRequestException(`desktop_app release not found: ${normalizedVersion}`)
      }
      return matched
    })
  }

  override deleteRelease(version: string, options?: { force?: boolean }) {
    return this.adminService.deleteRelease(version, options)
  }

  override getChannels() {
    return this.adminService.getChannels()
  }

  override promoteChannel(channel: string, body?: Record<string, unknown>) {
    const normalized = String(channel || '').trim().toLowerCase()
    if (normalized !== 'stable') {
      throw new BadRequestException('desktop_app only supports stable channel')
    }

    return this.adminService.promoteStable(String(body?.version ?? ''))
  }

  override rollbackChannel(channel: string, body?: Record<string, unknown>) {
    const normalized = String(channel || '').trim().toLowerCase()
    if (normalized !== 'stable') {
      throw new BadRequestException('desktop_app only supports stable channel')
    }

    return this.adminService.rollbackStable(typeof body?.version === 'string' ? body.version : undefined)
  }
}
