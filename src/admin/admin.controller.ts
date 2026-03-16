import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminService } from './admin.service'
import type { GetChannelsResponse, ListReleaseDetailsResponse, ListReleasesResponse } from './admin.types'

type PromoteBody = { version?: string }

type RollbackBody = { version?: string }

type CreateUploadSessionBody = { version?: string }

type UploadSessionFileQuery = {
  fileName?: string
  chunkIndex?: string
  totalChunks?: string
  totalSizeBytes?: string
}

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('releases/upload-sessions')
  createUploadSession(@Body() body: CreateUploadSessionBody) {
    return this.adminService.createUploadSession(body.version ?? '')
  }

  @Post('releases/upload-sessions/:sessionId/files')
  uploadSessionFile(
    @Param('sessionId') sessionId: string,
    @Query() query: UploadSessionFileQuery,
    @Req() req: NodeJS.ReadableStream
  ) {
    return this.adminService.uploadSessionFile(sessionId, query.fileName ?? '', req, {
      chunkIndex: query.chunkIndex,
      totalChunks: query.totalChunks,
      totalSizeBytes: query.totalSizeBytes
    })
  }

  @Post('releases/upload-sessions/:sessionId/finalize')
  finalizeUploadSession(@Param('sessionId') sessionId: string) {
    return this.adminService.finalizeUploadSession(sessionId)
  }

  @Get('releases')
  listReleases(): Promise<ListReleasesResponse> {
    return this.adminService.listReleases()
  }

  @Get('releases/details')
  listReleaseDetails(): Promise<ListReleaseDetailsResponse> {
    return this.adminService.listReleaseDetails()
  }

  @Delete('releases/:version')
  deleteRelease(
    @Param('version') version: string,
    @Query('force') force: string | undefined
  ): Promise<{ ok: true }> {
    return this.adminService.deleteRelease(version, { force: String(force || '').trim() === '1' })
  }

  @Get('channels')
  getChannels(): Promise<GetChannelsResponse> {
    return this.adminService.getChannels()
  }

  @Post('channels/stable/promote')
  promoteStable(@Body() body: PromoteBody): Promise<GetChannelsResponse> {
    return this.adminService.promoteStable(body.version ?? '')
  }

  @Post('channels/stable/rollback')
  rollbackStable(@Body() body: RollbackBody): Promise<GetChannelsResponse> {
    return this.adminService.rollbackStable(body.version)
  }
}
