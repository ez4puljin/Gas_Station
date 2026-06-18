import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthTokens,
  type LoginInput,
  loginSchema,
  type RefreshInput,
  refreshSchema,
} from '@fuel/schemas';
import type { AuthUser } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '../../common/decorators/throttle.decorator';
import { ThrottleGuard } from '../../common/guards/throttle.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, ttlSeconds: 60 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Ip() ip: string,
  ): Promise<AuthTokens & { user: AuthUser }> {
    return this.auth.login(dto, ip ?? null);
  }

  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 20, ttlSeconds: 60 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<void> {
    await this.auth.logout(user, dto.refreshToken, ip ?? null);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }
}
