/** This app's cookie names, in a module the edge middleware can import — `lib/session.ts` is
 *  `server-only` and pulls in `next/headers`, which middleware cannot use. */
export const ACCESS_COOKIE = 'tho_access';
export const REFRESH_COOKIE = 'tho_refresh';
