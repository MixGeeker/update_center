import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminService } from './admin.service'
import type { GetChannelsResponse, ListReleaseDetailsResponse, ListReleasesResponse } from './admin.types'

type PromoteBody = { version?: string }

type RollbackBody = { version?: string }

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
