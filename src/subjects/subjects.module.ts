import { Module } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { AdminService } from '../admin/admin.service'
import { ArtifactsController } from './artifacts.controller'
import { InternalSubjectsController } from './internal-subjects.controller'
import { SubjectRegistryService } from './subject-registry.service'
import { SubjectsController } from './subjects.controller'
import { SubjectsService } from './subjects.service'

@Module({
  controllers: [SubjectsController, InternalSubjectsController, ArtifactsController],
  providers: [AdminAuthGuard, AdminService, SubjectRegistryService, SubjectsService]
})
export class SubjectsModule {}
