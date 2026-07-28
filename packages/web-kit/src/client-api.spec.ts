import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './request';
import { clientApi } from './client-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** jsdom refuses a real navigation, so the assignment target is swapped for a plain object. */
function stubLocation(pathname: string, search = '') {
  const location = { pathname, search, href: '' };

  Object.defineProperty(window, 'location', { value: location, writable: true });

  return location;
}

beforeEach(() => {
  stubLocation('/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clientApi', () => {
  it('calls the gateway through the BFF proxy with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'order-1' }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(clientApi('/orders/order-1')).resolves.toEqual({ id: 'order-1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/gateway/orders/order-1');
    expect(init.credentials).toBe('same-origin');
  });

  it('sends an expired session to login with a way back to the current page', async () => {
    const location = stubLocation('/orders', '?status=paid');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401)),
    );

    await expect(clientApi('/orders')).rejects.toBeInstanceOf(ApiError);

    expect(location.href).toBe(`/login?next=${encodeURIComponent('/orders?status=paid')}`);
  });

  it('leaves other failures to the caller instead of logging the user out', async () => {
    const location = stubLocation('/shows/1/seats');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Seat taken' }, 409)));

    await expect(clientApi('/holds')).rejects.toMatchObject({ kind: 'conflict' });

    expect(location.href).toBe('');
  });

  // A 403 is a role problem, not a session problem — bouncing to login would just loop.
  it('does not treat a forbidden response as a logout', async () => {
    const location = stubLocation('/dashboard');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403)));

    await expect(clientApi('/organizer/shows')).rejects.toMatchObject({ kind: 'forbidden' });

    expect(location.href).toBe('');
  });
});
