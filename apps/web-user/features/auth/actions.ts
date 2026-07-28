'use server';

import { redirect } from 'next/navigation';
import { safeRedirectPath } from '@tickethub/web-kit';
import { type AuthAction } from '@tickethub/web-kit/server';

import { signIn } from '@/lib/session';

/**
 * Sign-in and sign-up for the buyer app — one action, since the only difference is which gateway
 * endpoint it hits. `mode` and `next` are bound on the server, so neither is a form field the
 * browser could tamper with. Returns the message to show on rejection; success redirects.
 */
export async function authenticate(
  mode: AuthAction,
  next: string,
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    await signIn(mode, {
      email: formData.get('email'),
      password: formData.get('password'),
    });
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Something went wrong';
  }

  redirect(safeRedirectPath(next));
}
