'use server';

import { authTokensSchema, becomeOrganizerSchema } from '@tickethub/contracts';

import { serverApi, setSession } from '@/lib/session';

/**
 * Flips the signed-in account to `organizer` and creates its profile row. The gateway answers
 * with a fresh token pair because the caller's access token still says `role: 'user'` — write it
 * to the cookies here or every organizer route 403s until the old token expires.
 *
 * No `redirect()`: the caller has to `router.refresh()` against the new cookies first, and
 * `redirect()` throws before it can.
 */
export async function becomeOrganizerAction(name: string): Promise<void> {
  const tokens = await serverApi(
    '/auth/become-organizer',
    { method: 'POST', body: becomeOrganizerSchema.parse({ name }) },
    authTokensSchema,
  );

  await setSession(tokens);
}
