import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  AUTH_MESSAGE_PATTERNS,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.REGISTER))
  register(dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.LOGIN))
  login(dto: LoginDto) {
    return this.authService.login(dto);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.REFRESH))
  refresh(dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.VALIDATE))
  validate(p: { accessToken: string }) {
    return this.authService.validate(p.accessToken);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.GET_USER))
  getUser(params: { userId: string }) {
    return this.authService.getUser(params.userId);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS))
  getUsersByIds(params: { ids: string[] }) {
    return this.authService.getUsersByIds(params.ids);
  }

  @RabbitRPC(rpcSub(AUTH_MESSAGE_PATTERNS.BECOME_ORGANIZER))
  becomeOrganizer(params: { userId: string }) {
    return this.authService.becomeOrganizer(params.userId);
  }
}
