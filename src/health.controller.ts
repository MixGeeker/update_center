import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: 'update-center',
      time: new Date().toISOString()
    }
  }
}
