import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { BackendReleasesController } from './backend-releases.controller'
import { BackendReleasesService } from './backend-releases.service'

@Module({
  imports: [ConfigModule],
  controllers: [BackendReleasesController],
  providers: [BackendReleasesService, AdminAuthGuard]
})
export class BackendReleasesModule {}
