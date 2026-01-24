import { Controller, Get, Headers, Param, Res } from '@nestjs/common'
import { DownloadsService } from './downloads.service'
import type { LatestDownloadsResponse } from './downloads.types'

type MinimalResponse = {
  setHeader(name: string, value: string): void
  redirect(status: number, url: string): void
}

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Get(':channel/latest')
  getLatest(@Param('channel') channel: string): Promise<LatestDownloadsResponse> {
    return this.downloadsService.getLatestDownloads(channel)
  }

  @Get(':channel/latest/:platform')
  async redirectLatest(
    @Param('channel') channel: string,
    @Param('platform') platform: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() res: MinimalResponse
  ): Promise<void> {
    const result = await this.downloadsService.getLatestRedirectUrl(channel, platform, userAgent)

    // 避免浏览器/代理缓存旧版本跳转
    res.setHeader('Cache-Control', 'no-cache')
    if (platform.trim().toLowerCase() === 'auto') {
      res.setHeader('Vary', 'User-Agent')
    }

    res.redirect(302, result.url)
  }
}
