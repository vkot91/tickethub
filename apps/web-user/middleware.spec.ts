// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/cookies';
import { middleware } from './middleware';

vi.mock('./lib/env/server', () => ({ serverEnv: () => ({ GATEWAY_URL: 'http://gateway.test' }) }));

const claims = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'buyer@example.com',
  role: 'user',
};

function tokenFor(overrides: Record<string, unknown> = {}): string {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, exp: Date.now() / 1000 + 600, ...overrides }),
  ).toString('base64url');

  return `header.${payload}.signature`;
}

const liveToken = tokenFor();
const deadToken = tokenFor({ exp: Date.now() / 1000 - 60 });

/** Renewal is a plain `fetch` inside @tickethub/web-kit, so stubbing that exercises the real
 *  rotation code instead of a mock standing in for it. */
function mockRefresh(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'Error',
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function requestFor(pathname: string, cookies: Record<string, string> = {}) {
  const httpRequest = new NextRequest(`http://app.test${pathname}`);

  for (const [name, value] of Object.entries(cookies)) httpRequest.cookies.set(name, value);

  return httpRequest;
}

function cookieValue(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';')[0]
    .slice(name.length + 1);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('middleware', () => {
  it('lets a live session through untouched', async () => {
    const fetchMock = mockRefresh(200, {});

    const response = await middleware(requestFor('/orders', { [ACCESS_COOKIE]: liveToken }));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a visitor with no cookies to login with a way back', async () => {
    const response = await middleware(requestFor('/tickets'));

    expect(response.headers.get('location')).toBe('http://app.test/login?next=%2Ftickets');
  });

  // The bug this guards: an expired token still decodes, so it used to sail past the guard.
  it('does not accept an expired token just because its claims still parse', async () => {
    const response = await middleware(requestFor('/orders', { [ACCESS_COOKIE]: deadToken }));

    expect(response.headers.get('location')).toBe('http://app.test/login?next=%2Forders');
  });

  it('renews an expired token before the page renders', async () => {
    const fetchMock = mockRefresh(200, { accessToken: liveToken, refreshToken: 'next-refresh' });

    const httpRequest = requestFor('/orders', {
      [ACCESS_COOKIE]: deadToken,
      [REFRESH_COOKIE]: 'old-refresh',
    });

    const response = await middleware(httpRequest);

    expect(fetchMock.mock.calls[0][0]).toBe('http://gateway.test/auth/refresh');
    expect(response.headers.get('location')).toBeNull();

    // The Server Component reads the rewritten request, not the response.
    expect(httpRequest.cookies.get(ACCESS_COOKIE)?.value).toBe(liveToken);
    expect(cookieValue(response, ACCESS_COOKIE)).toBe(liveToken);
    expect(cookieValue(response, REFRESH_COOKIE)).toBe('next-refresh');
  });

  it('clears both cookies when the refresh token is dead, so the retry loop ends', async () => {
    mockRefresh(401, { message: 'Invalid refresh token' });

    const response = await middleware(
      requestFor('/orders', { [ACCESS_COOKIE]: deadToken, [REFRESH_COOKIE]: 'revoked' }),
    );

    expect(response.headers.get('location')).toBe('http://app.test/login?next=%2Forders');
    expect(cookieValue(response, ACCESS_COOKIE)).toBe('');
    expect(cookieValue(response, REFRESH_COOKIE)).toBe('');
  });

  it('ignores the organizer app’s cookies', async () => {
    const response = await middleware(
      requestFor('/orders', { tho_access: liveToken, tho_refresh: 'organizer-refresh' }),
    );

    expect(response.headers.get('location')).toBe('http://app.test/login?next=%2Forders');
  });
});
