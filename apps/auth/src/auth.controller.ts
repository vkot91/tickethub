import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  type RegisterDto,
  type LoginDto,
  type RefreshDto,
} from '@tickethub/contracts';
import { AuthService } from './auth.service';

const P = MESSAGE_PATTERNS.auth;

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(P.register) register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @MessagePattern(P.login) login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }
  @MessagePattern(P.refresh) refresh(@Payload() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }
  @MessagePattern(P.validate) validate(@Payload() p: { accessToken: string }) {
    return this.authService.validate(p.accessToken);
  }
}
