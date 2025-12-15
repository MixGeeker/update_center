import * as dotenv from 'dotenv'
dotenv.config()

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ensureUpdateStorage } from './updates/ensure-storage'

async function bootstrap() {
  await ensureUpdateStorage()

  const app = await NestFactory.create(AppModule)

  // 适配 Nginx / 反向代理部署
  if ((process.env.TRUST_PROXY || '').trim() === '1') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(app.getHttpAdapter().getInstance() as any).set('trust proxy', 1)
  }

  app.setGlobalPrefix('api')

  const port = Number(process.env.PORT || process.env.UPDATE_CENTER_PORT || 8600)
  await app.listen(port)

  Logger.log(`UpdateCenter is running on http://0.0.0.0:${port}`, 'Bootstrap')
  Logger.log(`Admin UI: http://0.0.0.0:${port}/admin/`, 'Bootstrap')
  Logger.log(`Updates base: http://0.0.0.0:${port}/updates/stable/`, 'Bootstrap')
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
