// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerOrganizerAction } from './actions';
import { signIn } from '@/lib/session';
import { becomeOrganizerAction } from '@/features/organizer/actions';
import { redirect } from 'next/navigation';

vi.mock('@/lib/session', () => ({ signIn: vi.fn() }));
vi.mock('@/features/organizer/actions', () => ({ becomeOrganizerAction: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

function signup(name = 'Neon Promotions') {
  return {
    email: 'promoter@example.com',
    password: 'hunter2hunter2',
    name,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('registerOrganizerAction', () => {
  it('registers, flips the role, and lands on the shows list', async () => {
    await expect(registerOrganizerAction(signup())).resolves.toBeUndefined();

    expect(signIn).toHaveBeenCalledWith('register', {
      email: 'promoter@example.com',
      password: 'hunter2hunter2',
    });
    expect(becomeOrganizerAction).toHaveBeenCalledWith('Neon Promotions');
    expect(redirect).toHaveBeenCalledWith('/shows?welcome=1');
  });

  // A taken email must not go on to create an organizer profile for someone else's account.
  it('stops at the gateway message when the account cannot be created', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Email already registered'));

    await expect(registerOrganizerAction(signup())).resolves.toBe('Email already registered');

    expect(becomeOrganizerAction).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  // The account exists and the session is live by now, so the visitor is told where to finish
  // rather than being sent back to a signup form that would only 409 on the email.
  it('points at /become when the account is made but the role flip fails', async () => {
    vi.mocked(becomeOrganizerAction).mockRejectedValueOnce(new Error('shows down'));

    await expect(registerOrganizerAction(signup())).resolves.toMatch(/become an organizer/i);

    expect(redirect).not.toHaveBeenCalled();
  });
});
