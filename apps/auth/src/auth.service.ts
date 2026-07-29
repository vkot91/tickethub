import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { and, eq, inArray } from 'drizzle-orm';
import { users, type Db } from '@tickethub/db';
import type {
  RegisterDto,
  LoginDto,
  AuthTokens,
  RefreshDto,
  GetUserResponse,
} from '@tickethub/contracts';
import { USER_ROUTING_KEYS } from '@tickethub/contracts';
import { JwtService } from './jwt.service';
import type Redis from 'ioredis';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { publishEvent } from '@tickethub/rmq';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly amqp: AmqpConnection,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, dto.email) });

    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [user] = await this.db
      .insert(users)
      .values({ email: dto.email, passwordHash })
      .returning();

    // fire-and-forget: no consumer today, and registration shouldn't fail on a broker hiccup
    void publishEvent(this.amqp, USER_ROUTING_KEYS.USER_REGISTERED, {
      messageId: uuid(),
      userId: user.id,
      email: user.email,
    }).catch(() => undefined);

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

  /**
   * Self-serve role flip. Only `user` is promoted — an admin keeps its role and an existing
   * organizer is a no-op, so the route is safe to retry.
   *
   * Returns a fresh token pair because the caller's JWT still says `user` and every organizer
   * route is behind RolesGuard; the refresh token is rotated into Redis like login does, or the
   * next refresh would fail against the stored one.
   */
  async becomeOrganizer(userId: string): Promise<AuthTokens> {
    await this.db
      .update(users)
      .set({ role: 'organizer' })
      .where(and(eq(users.id, userId), eq(users.role, 'user')));

    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user) throw new NotFoundException('User not found');

    const tokens = await this.jwt.createTokens({ id: user.id, email: user.email, role: user.role });

    await this.redis.set(`refresh:${user.id}`, tokens.refreshToken, 'EX', 60 * 60 * 24 * 30);

    return tokens;
  }

  async getUser(userId: string): Promise<GetUserResponse> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user) throw new NotFoundException('User not found');

    return { userId: user.id, email: user.email };
  }

  /**
   * The batched sibling of `getUser`: one call resolves every buyer on a page. Missing ids are
   * simply absent — a deleted buyer is a blank cell, not a failed dashboard.
   */
  async getUsersByIds(ids: string[]): Promise<{ id: string; email: string }[]> {
    if (ids.length === 0) return [];

    return this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, ids));
  }

  async validate(accessToken: string) {
    return this.jwt.verifyAccess(accessToken).catch(() => {
      throw new UnauthorizedException();
    });
  }
}
