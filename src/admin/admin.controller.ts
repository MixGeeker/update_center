import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminService } from './admin.service'
import type { GetChannelsResponse, ListReleasesResponse } from './admin.types'

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
