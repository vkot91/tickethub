import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  type RegisterDto,
  type LoginDto,
  type RefreshDto,
} from '@tickethub/contracts';
import { AuthService } from './auth.service';

const message_keys = MESSAGE_PATTERNS.auth;

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(message_keys.register) register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @MessagePattern(message_keys) login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }
  @MessagePattern(message_keys) refresh(@Payload() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }
  @MessagePattern(message_keys.validate) validate(@Payload() p: { accessToken: string }) {
    return this.authService.validate(p.accessToken);
  }
}
