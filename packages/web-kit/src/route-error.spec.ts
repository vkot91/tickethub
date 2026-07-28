import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiError } from './request';
import { toErrorResponse } from './route-error';

describe('toErrorResponse', () => {
  it('passes a gateway failure through with its status and message', async () => {
    const response = toErrorResponse(new ApiError('conflict', 409, 'Seat already taken'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: 'Seat already taken' });
  });

  it('turns a schema failure into a 422 with every issue listed', async () => {
    const failure = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });

    const response = toErrorResponse(failure.success ? null : failure.error);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ message: ['Invalid email'] });
  });

  // What `fetch` throws when nothing is listening on GATEWAY_URL.
  it('reports an unreachable gateway as a 502 rather than a blank 500', async () => {
    const response = toErrorResponse(new TypeError('fetch failed'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: 'The gateway is unreachable' });
  });

  it('hides an unexpected error behind a 500', async () => {
    const response = toErrorResponse(new Error('connection reset'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: 'Unexpected error' });
  });
});
