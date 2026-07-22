import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ZodValidationPipe } from '@tickethub/common';
import { rpcRequest } from '@tickethub/rmq';
import {
  AUTH_MESSAGE_PATTERNS,
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from '@tickethub/contracts';

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
}
