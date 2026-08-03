'use server';

import { redirect } from 'next/navigation';

import type { LoginDto } from '@tickethub/contracts';
import { safeRedirectPath } from '@tickethub/web-kit';
import { type AuthAction } from '@tickethub/web-kit/server';

import { signIn } from '@/lib/session';

/**
 * Sign-in and sign-up for the buyer app — one action, since the only difference is which gateway
 * endpoint it hits. `mode` and `next` are passed by the caller, not by the form, so neither is a
 * field the browser could tamper with. Returns the message to show on rejection; success
 * redirects.
 */
export async function authenticate(
  mode: AuthAction,
  next: string,
  credentials: LoginDto,
): Promise<string | null> {
  try {
    await signIn(mode, credentials);
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Something went wrong';
  }

  redirect(safeRedirectPath(next));
}
