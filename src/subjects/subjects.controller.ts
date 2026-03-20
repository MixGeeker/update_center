import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { SubjectsService } from './subjects.service'

type UploadSessionBody = { version?: string }
type UploadSessionFileQuery = {
  fileName?: string
  chunkIndex?: string
  totalChunks?: string
  totalSizeBytes?: string
}

@Controller('admin/subjects')
@UseGuards(AdminAuthGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  listSubjects() {
    return this.subjectsService.listSubjects()
  }

  @Get(':subjectId')
  getSubject(@Param('subjectId') subjectId: string) {
    return this.subjectsService.getSubject(subjectId)
  }

  @Post(':subjectId/releases/upload-sessions')
  createUploadSession(@Param('subjectId') subjectId: string, @Body() body: UploadSessionBody) {
    return this.subjectsService.createUploadSession(subjectId, { version: body.version ?? '' })
  }

  @Post(':subjectId/releases/upload-sessions/:sessionId/files/:slot')
  uploadSessionFile(
    @Param('subjectId') subjectId: string,
    @Param('sessionId') sessionId: string,
    @Param('slot') slot: string,
    @Query() query: UploadSessionFileQuery,
    @Req() req: NodeJS.ReadableStream
  ) {
    return this.subjectsService.uploadSessionFile(subjectId, sessionId, slot, query.fileName ?? '', req, {
      chunkIndex: query.chunkIndex,
      totalChunks: query.totalChunks,
      totalSizeBytes: query.totalSizeBytes
    })
  }

  @Post(':subjectId/releases/upload-sessions/:sessionId/finalize')
  finalizeUploadSession(
    @Param('subjectId') subjectId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.finalizeUploadSession(subjectId, sessionId, body)
  }

  @Get(':subjectId/releases')
  listReleases(@Param('subjectId') subjectId: string) {
    return this.subjectsService.listReleases(subjectId)
  }

  @Get(':subjectId/releases/details')
  listReleaseDetails(@Param('subjectId') subjectId: string) {
    return this.subjectsService.listReleaseDetails(subjectId)
  }

  @Get(':subjectId/releases/:version')
  getRelease(@Param('subjectId') subjectId: string, @Param('version') version: string) {
    return this.subjectsService.getRelease(subjectId, version)
  }

  @Delete(':subjectId/releases/:version')
  deleteRelease(
    @Param('subjectId') subjectId: string,
    @Param('version') version: string,
    @Query('force') force: string | undefined
  ) {
    return this.subjectsService.deleteRelease(subjectId, version, {
      force: String(force || '').trim() === '1'
    })
  }

  @Get(':subjectId/channels')
  getChannels(@Param('subjectId') subjectId: string) {
    return this.subjectsService.getChannels(subjectId)
  }

  @Post(':subjectId/channels/:channel/promote')
  promoteChannel(
    @Param('subjectId') subjectId: string,
    @Param('channel') channel: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.promoteChannel(subjectId, channel, body)
  }

  @Post(':subjectId/channels/:channel/rollback')
  rollbackChannel(
    @Param('subjectId') subjectId: string,
    @Param('channel') channel: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.rollbackChannel(subjectId, channel, body)
  }

  @Get(':subjectId/compatibility/active')
  getActiveCompatibility(@Param('subjectId') subjectId: string) {
    return this.subjectsService.getActiveCompatibility(subjectId)
  }

  @Get(':subjectId/compatibility/:version')
  getCompatibility(@Param('subjectId') subjectId: string, @Param('version') version: string) {
    return this.subjectsService.getCompatibility(subjectId, version)
  }

  @Put(':subjectId/compatibility/:version')
  upsertCompatibility(
    @Param('subjectId') subjectId: string,
    @Param('version') version: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.subjectsService.upsertCompatibility(subjectId, version, body)
  }

  @Get(':subjectId/environments')
  listEnvironments(@Param('subjectId') subjectId: string) {
    return this.subjectsService.listEnvironments(subjectId)
  }

  @Get(':subjectId/environments/:environmentId')
  getEnvironment(@Param('subjectId') subjectId: string, @Param('environmentId') environmentId: string) {
    return this.subjectsService.getEnvironment(subjectId, environmentId)
  }

  @Get(':subjectId/environments/:environmentId/resolved')
  getResolvedEnvironment(
    @Param('subjectId') subjectId: string,
    @Param('environmentId') environmentId: string
  ) {
    return this.subjectsService.getResolvedEnvironment(subjectId, environmentId)
  }

  @Put(':subjectId/environments/:environmentId')
  upsertEnvironment(
    @Param('subjectId') subjectId: string,
    @Param('environmentId') environmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { headers?: Record<string, string | string[] | undefined> }
  ) {
    const actor = req?.headers?.['x-uname-actor']
    return this.subjectsService.upsertEnvironment(subjectId, environmentId, body, {
      actor: Array.isArray(actor) ? actor[0] : actor
    })
  }

  @Post(':subjectId/deployments')
  createDeployment(@Param('subjectId') subjectId: string, @Body() body: Record<string, unknown>) {
    return this.subjectsService.createDeployment(subjectId, body)
  }

  @Get(':subjectId/deployments')
  listDeployments(@Param('subjectId') subjectId: string) {
    return this.subjectsService.listDeployments(subjectId)
  }

  @Get(':subjectId/deployments/:deploymentId')
  getDeployment(@Param('subjectId') subjectId: string, @Param('deploymentId') deploymentId: string) {
    return this.subjectsService.getDeployment(subjectId, deploymentId)
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
