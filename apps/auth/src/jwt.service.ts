import { Injectable } from '@nestjs/common';
import { JwtService as NestJwt } from '@nestjs/jwt';
import type { UserPayload, AuthTokens } from '@tickethub/contracts';

@Injectable()
export class JwtService {
  private jwt = new NestJwt({});
  constructor(private readonly secrets: { accessSecret: string; refreshSecret: string }) {}

  async createTokens(payload: UserPayload): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.secrets.accessSecret,
      expiresIn: '15m',
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.id },
      { secret: this.secrets.refreshSecret, expiresIn: '30d' },
    );
    return { accessToken, refreshToken };
  }
  async verifyAccess(token: string): Promise<UserPayload> {
    return this.jwt.verifyAsync(token, { secret: this.secrets.accessSecret });
  }
  async verifyRefresh(token: string): Promise<{ sub: string }> {
    return this.jwt.verifyAsync(token, { secret: this.secrets.refreshSecret });
  }
}
