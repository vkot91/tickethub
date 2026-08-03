// @vitest-environment node
import { redirect } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { signIn } from '@/lib/session';

import { signInAction } from './actions';

vi.mock('@/lib/session', () => ({ signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

function credentials(email = 'promoter@example.com', password = 'hunter2hunter2') {
  return { email, password };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('signInAction', () => {
  it('signs in and lands on the requested page', async () => {
    await expect(signInAction('/shows', credentials())).resolves.toBeUndefined();

    expect(signIn).toHaveBeenCalledWith('login', {
      email: 'promoter@example.com',
      password: 'hunter2hunter2',
    });
    expect(redirect).toHaveBeenCalledWith('/shows');
  });

  it('returns the gateway message and does not redirect when sign-in fails', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(signInAction('/', credentials())).resolves.toBe('Invalid credentials');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuses to send the visitor off-site', async () => {
    await signInAction('//evil.example', credentials());

    expect(redirect).toHaveBeenCalledWith('/');
  });
});
