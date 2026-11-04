import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { LoginRequest, RegisterRequest } from '@oraviq/shared';
import { Throttle } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '../../common/guards/client-ip-throttler.guard';
import { CurrentUser, Public, type AuthUser } from '../../common/decorators';
import { AuthService } from './auth.service';

@ApiTags('auth')
@UseGuards(ClientIpThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  @ApiBody({ schema: { example: { businessName: 'Demo Roll-Off Co.', ownerName: 'Sam', email: 'sam@example.com', password: 'secret123', phone: '(404) 555-0100', city: 'Atlanta', state: 'GA' } } })
  register(@Body() body: RegisterRequest) {
    return this.auth.register(body ?? ({} as RegisterRequest));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  @ApiBody({ schema: { example: { email: 'demo@oraviq.ai', password: 'demo1234' } } })
  login(@Body() body: LoginRequest) {
    return this.auth.login(body?.email, body?.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiBody({ schema: { example: { refreshToken: 'rt_…' } } })
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body?.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.tenantId);
  }
}
