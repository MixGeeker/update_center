import { Injectable } from '@nestjs/common'
import { SubjectRegistryService } from './subject-registry.service'

@Injectable()
export class SubjectsService {
  constructor(private readonly registry: SubjectRegistryService) {}

  listSubjects() {
    return {
      subjects: this.registry.list().map((item) => item.describe())
    }
  }

  getSubject(subjectId: string) {
    return this.registry.get(subjectId).describe()
  }

  createUploadSession(subjectId: string, body: Record<string, unknown>) {
    return this.registry.get(subjectId).createUploadSession(body)
  }

  uploadSessionFile(
    subjectId: string,
    sessionId: string,
    slot: string,
    fileName: string,
    stream: NodeJS.ReadableStream,
    options?: { chunkIndex?: unknown; totalChunks?: unknown; totalSizeBytes?: unknown }
  ) {
    return this.registry.get(subjectId).uploadSessionFile(sessionId, slot, fileName, stream, options)
  }

  finalizeUploadSession(subjectId: string, sessionId: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).finalizeUploadSession(sessionId, body)
  }

  listReleases(subjectId: string) {
    return this.registry.get(subjectId).listReleases()
  }

  listReleaseDetails(subjectId: string) {
    return this.registry.get(subjectId).listReleaseDetails()
  }

  getRelease(subjectId: string, version: string) {
    return this.registry.get(subjectId).getRelease(version)
  }

  deleteRelease(subjectId: string, version: string, options?: { force?: boolean }) {
    return this.registry.get(subjectId).deleteRelease(version, options)
  }

  getChannels(subjectId: string) {
    return this.registry.get(subjectId).getChannels()
  }

  promoteChannel(subjectId: string, channel: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).promoteChannel(channel, body)
  }

  rollbackChannel(subjectId: string, channel: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).rollbackChannel(channel, body)
  }

  getActiveCompatibility(subjectId: string) {
    return this.registry.get(subjectId).getActiveCompatibility()
  }

  getCompatibility(subjectId: string, version: string) {
    return this.registry.get(subjectId).getCompatibility(version)
  }

  upsertCompatibility(subjectId: string, version: string, body: Record<string, unknown>) {
    return this.registry.get(subjectId).upsertCompatibility(version, body)
  }

  listEnvironments(subjectId: string) {
    return this.registry.get(subjectId).listEnvironments()
  }

  getEnvironment(subjectId: string, environmentId: string) {
    return this.registry.get(subjectId).getEnvironment(environmentId)
  }

  getResolvedEnvironment(subjectId: string, environmentId: string) {
    return this.registry.get(subjectId).getResolvedEnvironment(environmentId)
  }

  upsertEnvironment(
    subjectId: string,
    environmentId: string,
    body?: Record<string, unknown>,
    options?: { actor?: string }
  ) {
    return this.registry.get(subjectId).upsertEnvironment(environmentId, body, options)
  }

  createDeployment(subjectId: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).createDeployment(body)
  }

  listDeployments(subjectId: string) {
    return this.registry.get(subjectId).listDeployments()
  }

  getDeployment(subjectId: string, deploymentId: string) {
    return this.registry.get(subjectId).getDeployment(deploymentId)
  }

  updateDeployment(subjectId: string, deploymentId: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).updateDeployment(deploymentId, body)
  }

  getNextDeployment(subjectId: string, environmentId: string) {
    return this.registry.get(subjectId).getNextDeployment(environmentId)
  }

  claimDeployment(subjectId: string, deploymentId: string, body?: Record<string, unknown>) {
    return this.registry.get(subjectId).claimDeployment(deploymentId, body)
  }
}
