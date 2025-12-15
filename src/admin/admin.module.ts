import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [ConfigModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthGuard]
})
export class AdminModule {}
