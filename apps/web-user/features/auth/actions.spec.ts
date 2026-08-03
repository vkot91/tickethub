// @vitest-environment node
import { redirect } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { signIn } from '@/lib/session';

import { authenticate } from './actions';

vi.mock('@/lib/session', () => ({ signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

function credentials(email = 'buyer@example.com', password = 'hunter2hunter2') {
  return { email, password };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('authenticate', () => {
  it('signs in with the bound mode and lands on the requested page', async () => {
    await expect(authenticate('login', '/tickets', credentials())).resolves.toBeUndefined();

    expect(signIn).toHaveBeenCalledWith('login', {
      email: 'buyer@example.com',
      password: 'hunter2hunter2',
    });
    expect(redirect).toHaveBeenCalledWith('/tickets');
  });

  it('registers when that is the bound mode', async () => {
    await authenticate('register', '/', credentials());

    expect(vi.mocked(signIn).mock.calls[0][0]).toBe('register');
  });

  it('returns the gateway message and does not redirect when sign-in fails', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(authenticate('login', '/', credentials())).resolves.toBe('Invalid credentials');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuses to send the visitor off-site', async () => {
    await authenticate('login', '//evil.example', credentials());

    expect(redirect).toHaveBeenCalledWith('/');
  });
});
