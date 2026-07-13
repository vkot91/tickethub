import { JwtService } from './jwt.service';

const jwt = new JwtService({ accessSecret: 'access-secret', refreshSecret: 'refresh-secret' });

describe('JwtService', () => {
  const payload = { id: 'u1', email: 'a@b.com', role: 'user' as const };

  it('issues an access token that verifies back to the payload', async () => {
    const { accessToken } = await jwt.createTokens(payload);
    const decoded = await jwt.verifyAccess(accessToken);
    expect(decoded).toMatchObject(payload);
  });

  it('issues a refresh token carrying the user id as sub', async () => {
    const { refreshToken } = await jwt.createTokens(payload);
    const decoded = await jwt.verifyRefresh(refreshToken);
    expect(decoded.sub).toBe('u1');
  });

  it('rejects an access token signed with the wrong secret', async () => {
    const { refreshToken } = await jwt.createTokens(payload);
    await expect(jwt.verifyAccess(refreshToken)).rejects.toThrow();
  });
});
