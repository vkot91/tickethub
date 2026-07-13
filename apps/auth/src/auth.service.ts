import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { users, type Db } from '@tickethub/db';
import type { RegisterDto, LoginDto, AuthTokens, RefreshDto } from '@tickethub/contracts';
import { EVENT_ROUTING_KEYS } from '@tickethub/contracts';
import { JwtService } from './jwt.service';
import type Redis from 'ioredis';
import type { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly client: ClientProxy,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, dto.email) });

    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [user] = await this.db
      .insert(users)
      .values({ email: dto.email, passwordHash })
      .returning();

    this.client.emit(EVENT_ROUTING_KEYS.userRegistered, {
      messageId: uuid(),
      userId: user.id,
      email: user.email,
    });

    return this.jwt.createTokens({ id: user.id, email: user.email, role: user.role });
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, dto.email) });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.jwt.createTokens({ id: user.id, email: user.email, role: user.role });

    await this.redis.set(`refresh:${user.id}`, tokens.refreshToken, 'EX', 60 * 60 * 24 * 30);

    return tokens;
  }

  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    const { sub } = await this.jwt.verifyRefresh(dto.refreshToken).catch(() => {
      throw new UnauthorizedException();
    });

    const stored = await this.redis.get(`refresh:${sub}`);

    if (stored !== dto.refreshToken) throw new UnauthorizedException('Refresh token revoked');

    const user = await this.db.query.users.findFirst({ where: eq(users.id, sub) });

    if (!user) throw new UnauthorizedException();

    const tokens = await this.jwt.createTokens({ id: user.id, email: user.email, role: user.role });

    await this.redis.set(`refresh:${user.id}`, tokens.refreshToken, 'EX', 60 * 60 * 24 * 30); // rotation

    return tokens;
  }

  async validate(accessToken: string) {
    return this.jwt.verifyAccess(accessToken).catch(() => {
      throw new UnauthorizedException();
    });
  }
}
