'use server';

import { redirect } from 'next/navigation';
import { safeRedirectPath } from '@tickethub/web-kit';

import { signIn } from '@/lib/session';

/**
 * Sign-in for the organizer console. Runs on the server, so the tokens go straight into this
 * app's cookies and the form still works before the page hydrates. Returns the message to show
 * when the gateway rejects the credentials; on success it never returns — it redirects.
 */
export async function signInAction(
  next: string,
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    await signIn('login', {
      email: formData.get('email'),
      password: formData.get('password'),
    });
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Something went wrong';
  }

  redirect(safeRedirectPath(next));
}
