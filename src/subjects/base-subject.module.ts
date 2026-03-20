import { BadRequestException } from '@nestjs/common'
import type { SubjectCapabilities, SubjectDescriptor } from './subject.types'

type UploadSessionFileOptions = {
  chunkIndex?: unknown
  totalChunks?: unknown
  totalSizeBytes?: unknown
}

export abstract class BaseSubjectModule {
  abstract readonly subjectId: string
  abstract readonly displayName: string
  abstract readonly kind: 'desktop' | 'service' | 'agent'
  abstract readonly uploadSlots: string[]
  abstract readonly capabilities: SubjectCapabilities

  describe(): SubjectDescriptor {
    return {
      subjectId: this.subjectId,
      displayName: this.displayName,
      kind: this.kind,
      capabilities: this.capabilities,
      uploadSlots: [...this.uploadSlots]
    }
  }

  createUploadSession(_body: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support upload session creation`)
  }

  uploadSessionFile(
    _sessionId: string,
    _slot: string,
    _fileName: string,
    _stream: NodeJS.ReadableStream,
    _options?: UploadSessionFileOptions
  ) {
    throw new BadRequestException(`${this.subjectId} does not support upload session file uploads`)
  }

  finalizeUploadSession(_sessionId: string, _body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support upload finalize`)
  }

  listReleases() {
    throw new BadRequestException(`${this.subjectId} does not support release listing`)
  }

  listReleaseDetails() {
    throw new BadRequestException(`${this.subjectId} does not support release details`)
  }

  getRelease(_version: string) {
    throw new BadRequestException(`${this.subjectId} does not support release lookup`)
  }

  deleteRelease(_version: string, _options?: { force?: boolean }) {
    throw new BadRequestException(`${this.subjectId} does not support release deletion`)
  }

  getChannels() {
    throw new BadRequestException(`${this.subjectId} does not support channels`)
  }

  promoteChannel(_channel: string, _body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support channel promotion`)
  }

  rollbackChannel(_channel: string, _body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support channel rollback`)
  }

  getActiveCompatibility() {
    throw new BadRequestException(`${this.subjectId} does not support compatibility`)
  }

  getCompatibility(_version: string) {
    throw new BadRequestException(`${this.subjectId} does not support compatibility`)
  }

  upsertCompatibility(_version: string, _body: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support compatibility`)
  }

  listEnvironments() {
    throw new BadRequestException(`${this.subjectId} does not support environments`)
  }

  getEnvironment(_environmentId: string) {
    throw new BadRequestException(`${this.subjectId} does not support environments`)
  }

  getResolvedEnvironment(_environmentId: string) {
    throw new BadRequestException(`${this.subjectId} does not support environments`)
  }

  upsertEnvironment(_environmentId: string, _body?: Record<string, unknown>, _options?: { actor?: string }) {
    throw new BadRequestException(`${this.subjectId} does not support environments`)
  }

  createDeployment(_body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }

  listDeployments() {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }

  getDeployment(_deploymentId: string) {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }

  updateDeployment(_deploymentId: string, _body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }

  getNextDeployment(_environmentId: string) {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }

  claimDeployment(_deploymentId: string, _body?: Record<string, unknown>) {
    throw new BadRequestException(`${this.subjectId} does not support deployments`)
  }
}
