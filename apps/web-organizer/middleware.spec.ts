// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_COOKIE } from './lib/cookies';
import { middleware } from './middleware';

vi.mock('./lib/env/server', () => ({ serverEnv: () => ({ GATEWAY_URL: 'http://gateway.test' }) }));

// Renewal itself is covered in @tickethub/web-kit; here it must only never reach the network.
// What is app-specific is who gets let in, so that is what this file tests.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function tokenFor(role: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      email: `${role}@example.com`,
      role,
      exp: Date.now() / 1000 + 600,
    }),
  ).toString('base64url');

  return `header.${payload}.signature`;
}

function requestFor(pathname: string, cookies: Record<string, string> = {}) {
  const httpRequest = new NextRequest(`http://console.test${pathname}`);

  for (const [name, value] of Object.entries(cookies)) httpRequest.cookies.set(name, value);

  return httpRequest;
}

describe('middleware', () => {
  it('lets an organizer through', async () => {
    const response = await middleware(
      requestFor('/shows', { [ACCESS_COOKIE]: tokenFor('organizer') }),
    );

    expect(response.headers.get('location')).toBeNull();
  });

  it('sends a visitor with no session to login with a way back', async () => {
    const response = await middleware(requestFor('/shows'));

    expect(response.headers.get('location')).toBe('http://console.test/login?next=%2Fshows');
  });

  it('parks a plain buyer on /become instead of the console', async () => {
    const response = await middleware(requestFor('/shows', { [ACCESS_COOKIE]: tokenFor('user') }));

    expect(response.headers.get('location')).toBe('http://console.test/become');
  });

  // The loop this guards: /become is itself behind the matcher, so redirecting a `user` to it
  // unconditionally would bounce them off it forever.
  it('lets that buyer stay on /become', async () => {
    const response = await middleware(requestFor('/become', { [ACCESS_COOKIE]: tokenFor('user') }));

    expect(response.headers.get('location')).toBeNull();
  });

  it('ignores the buyer app’s cookies', async () => {
    const response = await middleware(
      requestFor('/shows', { th_access: tokenFor('organizer'), th_refresh: 'buyer-refresh' }),
    );

    expect(response.headers.get('location')).toBe('http://console.test/login?next=%2Fshows');
  });
});
