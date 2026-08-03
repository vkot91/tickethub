// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { serverApi, setSession } from '@/lib/session';

import { becomeOrganizerAction } from './actions';

vi.mock('@/lib/session', () => ({ serverApi: vi.fn(), setSession: vi.fn() }));

const tokens = { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' };

afterEach(() => {
  vi.clearAllMocks();
});

describe('becomeOrganizerAction', () => {
  it('posts the name and writes the re-issued token pair to the cookies', async () => {
    vi.mocked(serverApi).mockResolvedValueOnce(tokens);

    await becomeOrganizerAction('Neon Promotions');

    expect(serverApi).toHaveBeenCalledWith(
      '/auth/become-organizer',
      { method: 'POST', body: { name: 'Neon Promotions' } },
      expect.anything(),
    );
    expect(setSession).toHaveBeenCalledWith(tokens);
  });

  // The gateway would reject it anyway; failing here saves the round trip.
  it('rejects an empty name before calling the gateway', async () => {
    await expect(becomeOrganizerAction('')).rejects.toThrow();

    expect(serverApi).not.toHaveBeenCalled();
  });

  // The client schema trims before validating, but a server action is a public RPC endpoint —
  // a hand-crafted call bypasses the client entirely, so the server must not depend on it.
  it('rejects a whitespace-only name without calling the gateway', async () => {
    await expect(becomeOrganizerAction('   ')).rejects.toThrow();

    expect(serverApi).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before validating and posting the name', async () => {
    vi.mocked(serverApi).mockResolvedValueOnce(tokens);

    await becomeOrganizerAction('  Neon Promotions  ');

    expect(serverApi).toHaveBeenCalledWith(
      '/auth/become-organizer',
      { method: 'POST', body: { name: 'Neon Promotions' } },
      expect.anything(),
    );
  });

  // A failed call must not leave the old `role: 'user'` token replaced by nothing.
  it('does not touch the session when the gateway fails', async () => {
    vi.mocked(serverApi).mockRejectedValueOnce(new Error('gateway down'));

    await expect(becomeOrganizerAction('Neon Promotions')).rejects.toThrow('gateway down');

    expect(setSession).not.toHaveBeenCalled();
  });
});
