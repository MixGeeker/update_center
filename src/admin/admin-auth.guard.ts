import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = (this.configService.get<string>('UPDATE_ADMIN_TOKEN') || '').trim()
    if (!configured) {
      throw new InternalServerErrorException('UPDATE_ADMIN_TOKEN is not configured')
    }

    const req = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>()
    const auth = req.headers?.authorization

    if (!auth || typeof auth !== 'string') {
      throw new UnauthorizedException('Missing Authorization header')
    }

    if (auth.trim() !== `Bearer ${configured}`) {
      throw new UnauthorizedException('Invalid token')
    }

    return true
  }
}
