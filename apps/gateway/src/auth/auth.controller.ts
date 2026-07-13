import { Body, Controller, Inject, Post, UsePipes } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ZodValidationPipe } from '@tickethub/common';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  MESSAGE_PATTERNS,
  type RegisterDto,
  type LoginDto,
  type RefreshDto,
} from '@tickethub/contracts';
import { RPC } from '../tokens';

const P = MESSAGE_PATTERNS.auth;

@Controller('auth')
export class GatewayAuthController {
  constructor(@Inject(RPC.auth) private readonly auth: ClientProxy) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto) {
    return firstValueFrom(this.auth.send(P.register, dto));
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() dto: LoginDto) {
    return firstValueFrom(this.auth.send(P.login, dto));
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() dto: RefreshDto) {
    return firstValueFrom(this.auth.send(P.refresh, dto));
  }
}
