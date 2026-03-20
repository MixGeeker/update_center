import { Injectable, NotFoundException } from '@nestjs/common'
import { AdminService } from '../admin/admin.service'
import { BackendReleasesService } from '../backend-releases/backend-releases.service'
import { BaseSubjectModule } from './base-subject.module'
import { DesktopAppSubjectModule } from './desktop-app.subject'
import { EdgeBackendSubjectModule } from './edge-backend.subject'
import { EdgeFarmerWorkerSubjectModule } from './edge-farmer-worker.subject'

@Injectable()
export class SubjectRegistryService {
  private readonly subjects: BaseSubjectModule[]

  constructor(adminService: AdminService) {
    const edgeBackendService = new BackendReleasesService()
    const edgeFarmerWorkerService = new BackendReleasesService({
      subjectId: 'edge_farmer_worker',
      displayName: 'Edge Farmer Worker',
      serviceName: 'edge_farmer_worker',
      artifactBasePath: '/artifacts/edge_farmer_worker/releases',
      defaultServices: ['edge_farmer_worker'],
      supportsCompatibility: false,
      defaultEnvironmentId: 'edge-farmer-worker',
      environmentFileName: 'edge-farmer-worker.json',
      imagePlatform: 'linux/amd64'
    })

    this.subjects = [
      new DesktopAppSubjectModule(adminService),
      new EdgeBackendSubjectModule(edgeBackendService),
      new EdgeFarmerWorkerSubjectModule(edgeFarmerWorkerService)
    ]
  }

  list(): BaseSubjectModule[] {
    return [...this.subjects]
  }

  get(subjectIdInput: string): BaseSubjectModule {
    const subjectId = String(subjectIdInput || '').trim()
    const matched = this.subjects.find((item) => item.subjectId === subjectId)
    if (!matched) {
      throw new NotFoundException(`subject not found: ${subjectId}`)
    }
    return matched
  }
}
