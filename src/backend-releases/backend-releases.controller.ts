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
import { BackendReleasesService } from './backend-releases.service'

type CreateUploadSessionBody = {
  version?: string
}

type UploadSessionFileQuery = {
  fileName?: string
  chunkIndex?: string
  totalChunks?: string
  totalSizeBytes?: string
}

type PromoteBody = {
  version?: string
}

type CompatibilityBody = Record<string, unknown>

type CreateDeploymentBody = Record<string, unknown>

type UpdateDeploymentBody = Record<string, unknown>

type UpdateEnvironmentBody = Record<string, unknown>

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class BackendReleasesController {
  constructor(private readonly backendReleasesService: BackendReleasesService) {}

  @Post('backend-releases/upload-sessions')
  createUploadSession(@Body() body: CreateUploadSessionBody) {
    return this.backendReleasesService.createUploadSession(body.version ?? '')
  }

  @Post('backend-releases/upload-sessions/:sessionId/files/:slot')
  uploadSessionFile(
    @Param('sessionId') sessionId: string,
    @Param('slot') slot: string,
    @Query() query: UploadSessionFileQuery,
    @Req() req: NodeJS.ReadableStream
  ) {
    return this.backendReleasesService.uploadSessionFile(sessionId, slot, query.fileName ?? '', req, {
      chunkIndex: query.chunkIndex,
      totalChunks: query.totalChunks,
      totalSizeBytes: query.totalSizeBytes
    })
  }

  @Post('backend-releases/upload-sessions/:sessionId/finalize')
  finalizeUploadSession(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.backendReleasesService.finalizeUploadSession(sessionId, body)
  }

  @Get('backend-releases')
  listReleases() {
    return this.backendReleasesService.listReleases()
  }

  @Get('backend-releases/details')
  listReleaseDetails() {
    return this.backendReleasesService.listReleaseDetails()
  }

  @Get('backend-releases/:version')
  getRelease(@Param('version') version: string) {
    return this.backendReleasesService.getRelease(version)
  }

  @Delete('backend-releases/:version')
  deleteRelease(@Param('version') version: string, @Query('force') force: string | undefined) {
    return this.backendReleasesService.deleteRelease(version, {
      force: String(force || '').trim() === '1'
    })
  }

  @Get('backend-channels')
  getChannels() {
    return this.backendReleasesService.getChannels()
  }

  @Post('backend-channels/:channel/promote')
  promoteChannel(@Param('channel') channel: string, @Body() body: PromoteBody) {
    return this.backendReleasesService.promoteChannel(channel, body.version ?? '')
  }

  @Post('backend-channels/:channel/rollback')
  rollbackChannel(@Param('channel') channel: string, @Body() body: PromoteBody) {
    return this.backendReleasesService.rollbackChannel(channel, body.version)
  }

  @Put('backend-compatibility/:version')
  upsertCompatibility(@Param('version') version: string, @Body() body: CompatibilityBody) {
    return this.backendReleasesService.upsertCompatibility(version, body)
  }

  @Get('backend-compatibility/active')
  getActiveCompatibility() {
    return this.backendReleasesService.getActiveCompatibility()
  }

  @Get('backend-compatibility/:version')
  getCompatibility(@Param('version') version: string) {
    return this.backendReleasesService.getCompatibility(version)
  }

  @Get('backend-environments')
  listEnvironments() {
    return this.backendReleasesService.listEnvironments()
  }

  @Get('backend-environments/:environmentId')
  getEnvironment(@Param('environmentId') environmentId: string) {
    return this.backendReleasesService.getEnvironment(environmentId)
  }

  @Get('backend-environments/:environmentId/resolved')
  getResolvedEnvironment(@Param('environmentId') environmentId: string) {
    return this.backendReleasesService.getResolvedEnvironment(environmentId)
  }

  @Put('backend-environments/:environmentId')
  upsertEnvironment(
    @Param('environmentId') environmentId: string,
    @Body() body: UpdateEnvironmentBody,
    @Req() req: { headers?: Record<string, string | string[] | undefined> }
  ) {
    const actor = req?.headers?.['x-uname-actor']
    return this.backendReleasesService.upsertEnvironment(environmentId, body, {
      actor: Array.isArray(actor) ? actor[0] : actor
    })
  }

  @Post('backend-deployments')
  createDeployment(@Body() body: CreateDeploymentBody) {
    return this.backendReleasesService.createDeployment(body)
  }

  @Get('backend-deployments')
  listDeployments() {
    return this.backendReleasesService.listDeployments()
  }

  @Get('backend-deployments/:deploymentId')
  getDeployment(@Param('deploymentId') deploymentId: string) {
    return this.backendReleasesService.getDeployment(deploymentId)
  }

  @Put('backend-deployments/:deploymentId')
  updateDeployment(@Param('deploymentId') deploymentId: string, @Body() body: UpdateDeploymentBody) {
    return this.backendReleasesService.updateDeployment(deploymentId, body)
  }
}
