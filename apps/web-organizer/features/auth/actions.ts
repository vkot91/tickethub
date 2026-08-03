'use server';

import { redirect } from 'next/navigation';

import type { LoginDto } from '@tickethub/contracts';
import { safeRedirectPath } from '@tickethub/web-kit';

import { becomeOrganizerAction } from '@/features/organizer/actions';
import { signIn } from '@/lib/session';

import type { RegisterOrganizerForm } from './register-organizer-schema';

/**
 * Sign-in for the organizer console. Runs on the server, so the tokens go straight into this
 * app's cookies. Returns the message to show when the gateway rejects the credentials; on
 * success it never returns — it redirects.
 */
export async function signInAction(next: string, credentials: LoginDto): Promise<string | null> {
  try {
    await signIn('login', credentials);
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Something went wrong';
  }

  redirect(safeRedirectPath(next));
}

/**
 * Self-serve organizer signup. Both halves already existed — `POST /auth/register` mints the
 * account, `become-organizer` flips the role — but only the buyer site could reach the first,
 * so the console's front door was "go register at app.*, then come back". This chains them.
 *
 * Deliberately not atomic: there is no transaction across two services, and the failure it
 * would guard against is benign. A registered account whose flip failed is a working buyer
 * account one click from `/become`, which is idempotent, so the message says so instead.
 */
export async function registerOrganizerAction({
  name,
  ...credentials
}: RegisterOrganizerForm): Promise<string | null> {
  try {
    await signIn('register', credentials);
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Something went wrong';
  }

  try {
    await becomeOrganizerAction(name.trim());
  } catch {
    return 'Your account is ready, but we could not set up the organizer profile. Open “Become an organizer” to finish.';
  }

  redirect('/shows?welcome=1');
}
