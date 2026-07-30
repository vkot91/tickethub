import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { getTestDb, seedUser, type TestDb } from '@tickethub/db/testing';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';

const jwt = new JwtService({ accessSecret: 'access-secret', refreshSecret: 'refresh-secret' });

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;

beforeEach(async () => {
  db = await getTestDb();
});

// redis + AMQP connection stay simple mocks — only the db is a real emulated Postgres.
function makeService(opts: { storedRefresh?: string | null } = {}) {
  const redis = { set: jest.fn(), get: jest.fn().mockResolvedValue(opts.storedRefresh ?? null) };
  const svc = new AuthService(db, redis as never, jwt);
  return { svc, redis };
}

const hash = (pw: string) => bcrypt.hash(pw, 10);

async function refreshTokenFor(id: string) {
  return (await jwt.createTokens({ id, email: 'a@b.com', role: 'user' })).refreshToken;
}

describe('AuthService.register', () => {
  it('creates the user and returns tokens', async () => {
    const { svc } = makeService();

    const tokens = await svc.register({ email: 'a@b.com', password: 'password123' });

    expect(tokens.accessToken).toBeTruthy();
  });

  it('rejects a duplicate email', async () => {
    await seedUser(db, { email: 'a@b.com' });
    const { svc } = makeService();

    await expect(svc.register({ email: 'a@b.com', password: 'password123' })).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('AuthService.login', () => {
  it('rejects a bad password', async () => {
    await seedUser(db, { email: 'a@b.com', passwordHash: await hash('correct') });
    const { svc } = makeService();

    await expect(svc.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email', async () => {
    const { svc } = makeService();

    await expect(svc.login({ email: 'a@b.com', password: 'correct' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns tokens and stores the refresh token on success', async () => {
    const user = await seedUser(db, { email: 'a@b.com', passwordHash: await hash('correct') });
    const { svc, redis } = makeService();

    const tokens = await svc.login({ email: 'a@b.com', password: 'correct' });

    expect(tokens.refreshToken).toBeTruthy();
    expect(redis.set).toHaveBeenCalledWith(
      `refresh:${user.id}`,
      tokens.refreshToken,
      'EX',
      expect.any(Number),
    );
  });
});

describe('AuthService.refresh', () => {
  it('rotates tokens when the stored token matches', async () => {
    const user = await seedUser(db);
    const rt = await refreshTokenFor(user.id);
    const { svc, redis } = makeService({ storedRefresh: rt });

    const tokens = await svc.refresh({ refreshToken: rt });

    expect(tokens.refreshToken).toBeTruthy();
    expect(redis.set).toHaveBeenCalled();
  });

  it('rejects a token that no longer matches the stored one (revoked/rotated)', async () => {
    const user = await seedUser(db);
    const rt = await refreshTokenFor(user.id);
    const { svc } = makeService({ storedRefresh: 'a-different-token' });

    await expect(svc.refresh({ refreshToken: rt })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed refresh token', async () => {
    const { svc } = makeService();

    await expect(svc.refresh({ refreshToken: 'not-a-jwt' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the user no longer exists', async () => {
    const rt = await refreshTokenFor('00000000-0000-0000-0000-000000000000');
    const { svc } = makeService({ storedRefresh: rt });

    await expect(svc.refresh({ refreshToken: rt })).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.getUser', () => {
  it('returns userId + email for an existing user', async () => {
    const user = await seedUser(db, { email: 'buyer@x.com' });
    const { svc } = makeService();

    await expect(svc.getUser(user.id)).resolves.toEqual({ userId: user.id, email: 'buyer@x.com' });
  });

  it('throws NotFound for an unknown id', async () => {
    const { svc } = makeService();

    await expect(svc.getUser('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AuthService.becomeOrganizer', () => {
  it('flips a user to organizer and returns tokens carrying the new role', async () => {
    const user = await seedUser(db, { email: 'buyer@x.com' });
    const { svc, redis } = makeService();

    const tokens = await svc.becomeOrganizer(user.id);

    await expect(svc.validate(tokens.accessToken)).resolves.toMatchObject({ role: 'organizer' });
    expect(redis.set).toHaveBeenCalledWith(
      `refresh:${user.id}`,
      tokens.refreshToken,
      'EX',
      expect.any(Number),
    );
  });

  it('is idempotent for an existing organizer', async () => {
    const user = await seedUser(db, { role: 'organizer' });
    const { svc } = makeService();

    const tokens = await svc.becomeOrganizer(user.id);

    await expect(svc.validate(tokens.accessToken)).resolves.toMatchObject({ role: 'organizer' });
  });

  it('leaves an admin untouched', async () => {
    const user = await seedUser(db, { role: 'admin' });
    const { svc } = makeService();

    const tokens = await svc.becomeOrganizer(user.id);

    await expect(svc.validate(tokens.accessToken)).resolves.toMatchObject({ role: 'admin' });
  });

  it('throws NotFound for an unknown id', async () => {
    const { svc } = makeService();

    await expect(svc.becomeOrganizer('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AuthService.validate', () => {
  it('returns the payload for a valid access token', async () => {
    const { accessToken } = await jwt.createTokens({ id: 'u1', email: 'a@b.com', role: 'user' });
    const { svc } = makeService();

    await expect(svc.validate(accessToken)).resolves.toMatchObject({ id: 'u1' });
  });

  it('rejects an invalid access token', async () => {
    const { svc } = makeService();

    await expect(svc.validate('garbage')).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.getUsersByIds', () => {
  it('resolves a whole page of buyers in one call', async () => {
    const first = await seedUser(db, { email: 'one@x.com' });
    const second = await seedUser(db, { email: 'two@x.com' });
    const { svc } = makeService();

    const found = await svc.getUsersByIds(['' + second.id, first.id]);

    expect(found).toEqual(
      expect.arrayContaining([
        { id: first.id, email: 'one@x.com' },
        { id: second.id, email: 'two@x.com' },
      ]),
    );
    expect(found).toHaveLength(2);
  });

  // A deleted buyer must not take a dashboard page down with it — the caller degrades to
  // "Unknown buyer" on the rows it did not get back.
  it('omits ids that do not exist rather than throwing', async () => {
    const user = await seedUser(db, { email: 'only@x.com' });
    const { svc } = makeService();

    await expect(
      svc.getUsersByIds([user.id, '00000000-0000-0000-0000-000000000000']),
    ).resolves.toEqual([{ id: user.id, email: 'only@x.com' }]);
  });

  it('returns nothing for an empty list, without a query', async () => {
    const { svc } = makeService();

    await expect(svc.getUsersByIds([])).resolves.toEqual([]);
  });
});
