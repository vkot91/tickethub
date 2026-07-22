import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  AUTH_MESSAGE_PATTERNS,
  RPC_EXCHANGE,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from '@tickethub/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: AUTH_MESSAGE_PATTERNS.REGISTER })
  register(dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: AUTH_MESSAGE_PATTERNS.LOGIN })
  login(dto: LoginDto) {
    return this.authService.login(dto);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: AUTH_MESSAGE_PATTERNS.REFRESH })
  refresh(dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: AUTH_MESSAGE_PATTERNS.VALIDATE })
  validate(p: { accessToken: string }) {
    return this.authService.validate(p.accessToken);
  }
}
