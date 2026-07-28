import { describe, expect, it } from 'vitest';

import { decodeAccessToken, isAccessTokenExpired } from './jwt';

function tokenFor(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

  return `header.${payload}.signature`;
}

const validClaims = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'buyer@example.com',
  role: 'user',
};

describe('decodeAccessToken', () => {
  it('reads the user claims out of a token', () => {
    expect(decodeAccessToken(tokenFor(validClaims))).toEqual(validClaims);
  });

  it('keeps extra claims out of the returned payload', () => {
    expect(decodeAccessToken(tokenFor({ ...validClaims, iat: 1, exp: 2 }))).toEqual(validClaims);
  });

  it('returns null for a token whose claims do not match the contract', () => {
    expect(decodeAccessToken(tokenFor({ ...validClaims, role: 'superuser' }))).toBeNull();
  });

  it('returns null for a malformed token instead of throwing', () => {
    expect(decodeAccessToken('not-a-token')).toBeNull();
    expect(decodeAccessToken('header.@@@notbase64@@@.signature')).toBeNull();
  });
});

describe('isAccessTokenExpired', () => {
  const now = 1_800_000_000_000;
  const nowSeconds = now / 1000;

  function tokenExpiringAt(exp: number): string {
    return tokenFor({ ...validClaims, exp });
  }

  it('accepts a token with time left on it', () => {
    expect(isAccessTokenExpired(tokenExpiringAt(nowSeconds + 600), now)).toBe(false);
  });

  it('rejects a token whose expiry has passed', () => {
    expect(isAccessTokenExpired(tokenExpiringAt(nowSeconds - 1), now)).toBe(true);
  });

  // Renewing early beats sending a request that expires in flight.
  it('rejects a token inside the clock-skew window', () => {
    expect(isAccessTokenExpired(tokenExpiringAt(nowSeconds + 10), now)).toBe(true);
  });

  it('treats a token with no readable expiry as expired', () => {
    expect(isAccessTokenExpired(tokenFor(validClaims), now)).toBe(true);
    expect(isAccessTokenExpired(tokenExpiringAt('soon' as never), now)).toBe(true);
    expect(isAccessTokenExpired('not-a-token', now)).toBe(true);
  });
});
