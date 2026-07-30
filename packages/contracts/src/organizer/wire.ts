import type { Rpc } from '../shape';

/**
 * The organizer *account*, served by `apps/shows`. Keyed `organizer.profile.*` and not
 * `organizer.*`: `organizer` is the audience namespace every console key starts with, so leaving
 * these bare made the account look like the whole surface. `profile` is the resource, the same way
 * `shows` and `orders` are in the sibling maps.
 */
export const ORGANIZER_PROFILE_MESSAGE_PATTERNS = {
  CREATE: 'organizer.profile.create',
  SHOW_IDS: 'organizer.profile.showIds',
} as const;

export interface OrganizerProfileRpcContracts {
  [ORGANIZER_PROFILE_MESSAGE_PATTERNS.CREATE]: Rpc<{
    payload: { userId: string; name: string };
    result: string;
  }>;
  // Every show the caller owns. The gateway calls this first, then scopes each downstream
  // organizer read to the ids it comes back with — which is why no other service takes a `userId`.
  [ORGANIZER_PROFILE_MESSAGE_PATTERNS.SHOW_IDS]: Rpc<{
    payload: { userId: string };
    result: string[];
  }>;
}
