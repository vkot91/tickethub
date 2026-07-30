import { Body, Controller, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ZodValidationPipe } from '@tickethub/common';
import { rpcRequest } from '@tickethub/rmq';
import {
  AUTH_MESSAGE_PATTERNS,
  ORGANIZER_PROFILE_MESSAGE_PATTERNS,
  becomeOrganizerSchema,
  type AuthTokens,
  type BecomeOrganizerDto,
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class GatewayAuthController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto) {
    return rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.REGISTER, dto);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() dto: LoginDto) {
    return rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.LOGIN, dto);
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() dto: RefreshDto) {
    return rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.REFRESH, dto);
  }

  /**
   * The one organizer route that is not behind RolesGuard: the caller is still role `user`, which
   * is the whole point. It returns a fresh token pair, so the BFF re-sets both cookies exactly as
   * it does for POST /auth/refresh.
   *
   * The organizer row is materialised first — the display name has nowhere else to live, and
   * `organizer.create` is idempotent, so a failed role flip is safe to retry.
   */
  @Post('become-organizer')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(becomeOrganizerSchema))
  async becomeOrganizer(
    @Req() req: { user: { id: string } },
    @Body() dto: BecomeOrganizerDto,
  ): Promise<AuthTokens> {
    await rpcRequest(this.amqp, ORGANIZER_PROFILE_MESSAGE_PATTERNS.CREATE, {
      userId: req.user.id,
      name: dto.name,
    });

    return rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.BECOME_ORGANIZER, {
      userId: req.user.id,
    });
  }
}
