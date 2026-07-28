import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, request } from './request';

function respondWith(body: unknown, status = 200) {
  const text = body === null ? '' : JSON.stringify(body);

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Error',
    text: () => Promise.resolve(text),
  } as unknown as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('returns the parsed body on success', async () => {
    vi.stubGlobal('fetch', respondWith({ id: 'abc' }));

    await expect(request('/x', {}, z.object({ id: z.string() }))).resolves.toEqual({ id: 'abc' });
  });

  it('sends JSON headers only when there is a body', async () => {
    const fetchMock = respondWith({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    await request('/x');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('content-type');

    await request('/x', { method: 'POST', body: { a: 1 } });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      'content-type': 'application/json',
    });
  });

  it('attaches a bearer token when given one', async () => {
    const fetchMock = respondWith({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    await request('/x', { token: 'tok' });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [410, 'expired'],
    [422, 'validation'],
    [500, 'unknown'],
  ])('maps status %i to kind %s', async (status, kind) => {
    vi.stubGlobal('fetch', respondWith({ message: 'nope' }, status));

    await expect(request('/x')).rejects.toMatchObject({ kind, status, message: 'nope' });
  });

  it('treats an expired-order 409 as expired, not conflict', async () => {
    vi.stubGlobal('fetch', respondWith({ message: 'Order has expired' }, 409));

    await expect(request('/x')).rejects.toMatchObject({ kind: 'expired' });
  });

  it('reads the message from a bare-string error body rather than the status text', async () => {
    vi.stubGlobal('fetch', respondWith('Unknown ticketTypeId abc', 400));

    await expect(request('/x')).rejects.toThrow('Unknown ticketTypeId abc');
  });

  it('joins an array of validation messages', async () => {
    vi.stubGlobal('fetch', respondWith({ message: ['too short', 'not an email'] }, 422));

    await expect(request('/x')).rejects.toThrow('too short, not an email');
  });

  it('throws a ZodError when the response drifts from the contract', async () => {
    vi.stubGlobal('fetch', respondWith({ id: 42 }));

    await expect(request('/x', {}, z.object({ id: z.string() }))).rejects.not.toBeInstanceOf(
      ApiError,
    );
  });
});
