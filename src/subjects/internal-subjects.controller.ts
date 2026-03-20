import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { SubjectsService } from './subjects.service'

@Controller('internal/subjects')
@UseGuards(AdminAuthGuard)
export class InternalSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get(':subjectId/environments/:environmentId/resolved')
  getResolvedEnvironment(
    @Param('subjectId') subjectId: string,
    @Param('environmentId') environmentId: string
  ) {
    return this.subjectsService.getResolvedEnvironment(subjectId, environmentId)
  }

  @Get(':subjectId/releases/:version')
  getRelease(@Param('subjectId') subjectId: string, @Param('version') version: string) {
    return this.subjectsService.getRelease(subjectId, version)
  }

  @Get(':subjectId/deployments/next')
  getNextDeployment(@Param('subjectId') subjectId: string, @Query('environmentId') environmentId: string) {
    return this.subjectsService.getNextDeployment(subjectId, environmentId)
  }

  @Post(':subjectId/deployments/:deploymentId/actions/claim')
  claimDeployment(
    @Param('subjectId') subjectId: string,
    @Param('deploymentId') deploymentId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.claimDeployment(subjectId, deploymentId, body)
  }

  @Put(':subjectId/deployments/:deploymentId')
  updateDeployment(
    @Param('subjectId') subjectId: string,
    @Param('deploymentId') deploymentId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.updateDeployment(subjectId, deploymentId, body)
  }
}
