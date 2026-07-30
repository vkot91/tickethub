import { getUserRequestSchema, getUserResponseSchema, registerSchema } from './schema';
import { AUTH_MESSAGE_PATTERNS } from './wire';

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    const parsed = registerSchema.parse({ email: 'a@b.com', password: 'password123' });
    expect(parsed.email).toBe('a@b.com');
  });
  it('rejects short passwords', () => {
    expect(() => registerSchema.parse({ email: 'a@b.com', password: 'x' })).toThrow();
  });
  it('lowercases email', () => {
    expect(registerSchema.parse({ email: 'A@B.com', password: 'password123' }).email).toBe(
      'a@b.com',
    );
  });
});

describe('getUserRequestSchema', () => {
  it('accepts a valid userId', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    expect(getUserRequestSchema.parse({ userId })).toEqual({ userId });
  });

  it('rejects a non-uuid userId', () => {
    expect(() => getUserRequestSchema.parse({ userId: 'not-a-uuid' })).toThrow();
  });
});

describe('auth wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(AUTH_MESSAGE_PATTERNS.LOGIN).toBe('auth.login');
    expect(AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS).toBe('auth.getUsersByIds');
  });
});

describe('getUserResponseSchema', () => {
  it('accepts a valid user payload', () => {
    const user = { userId: '11111111-1111-1111-1111-111111111111', email: 'a@b.com' };
    expect(getUserResponseSchema.parse(user)).toEqual(user);
  });

  it('rejects an invalid email', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    expect(() => getUserResponseSchema.parse({ userId, email: 'not-an-email' })).toThrow();
  });
});
