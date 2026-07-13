import { registerSchema } from './auth';

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
