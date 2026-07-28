// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshTokens } from './refresh';

const GATEWAY = 'http://gateway.test';

const tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshTokens', () => {
  it('exchanges the refresh token for a new pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokens));

    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshTokens(GATEWAY, 'old-refresh')).resolves.toEqual(tokens);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(`${GATEWAY}/auth/refresh`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ refreshToken: 'old-refresh' }));
  });

  it('resolves to undefined when the refresh token is no longer accepted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'revoked' }, 401)));

    await expect(refreshTokens(GATEWAY, 'revoked-refresh')).resolves.toBeUndefined();
  });

  it('resolves to undefined when the gateway is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(refreshTokens(GATEWAY, 'some-refresh')).resolves.toBeUndefined();
  });

  // The auth service rotates on every use, so a second concurrent call would revoke the first.
  it('joins callers that arrive while a refresh is already in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokens));

    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      refreshTokens(GATEWAY, 'shared-refresh'),
      refreshTokens(GATEWAY, 'shared-refresh'),
      refreshTokens(GATEWAY, 'shared-refresh'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([tokens, tokens, tokens]);
  });

  it('starts a fresh attempt once the previous one has settled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokens));

    vi.stubGlobal('fetch', fetchMock);

    await refreshTokens(GATEWAY, 'sequential-refresh');
    await refreshTokens(GATEWAY, 'sequential-refresh');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps one failing session from resolving another session refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'revoked' }, 401))
      .mockResolvedValueOnce(jsonResponse(tokens));

    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      refreshTokens(GATEWAY, 'refresh-a'),
      refreshTokens(GATEWAY, 'refresh-b'),
    ]);

    expect(first).toBeUndefined();
    expect(second).toEqual(tokens);
  });
});
