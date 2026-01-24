import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ServeStaticModule } from '@nestjs/serve-static'
import { basename, join } from 'path'
import { AdminModule } from './admin/admin.module'
import { DownloadsModule } from './downloads/downloads.module'
import { resolveUpdateStoragePaths } from './updates/update-paths'
import { HealthController } from './health.controller'

const { channelsDir } = resolveUpdateStoragePaths()

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),

    // 管理面板（极简 HTML）
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'admin'),
      serveRoot: '/admin',
      serveStaticOptions: {
        index: ['index.html'],
        dotfiles: 'ignore'
      }
    }),

    // 网页下载页（给人工分发/手动安装使用）
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'download'),
      serveRoot: '/download',
      serveStaticOptions: {
        index: ['index.html'],
        dotfiles: 'ignore'
      }
    }),

    // 更新文件（给 electron-updater 拉取 latest*.yml 与安装包）
    // 对外 URL 形态：/updates/<channel>/...
    ServeStaticModule.forRoot({
      rootPath: channelsDir,
      serveRoot: '/updates',
      serveStaticOptions: {
        dotfiles: 'ignore',
        setHeaders: (res, filePath) => {
          const name = basename(filePath).toLowerCase()
          if (name === 'latest.yml' || name === 'latest-mac.yml' || name === 'latest-linux.yml') {
            res.setHeader('Cache-Control', 'no-cache')
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        }
      }
    }),

    AdminModule,
    DownloadsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
