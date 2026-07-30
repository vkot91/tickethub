import type { Rpc } from '../../shape';

/**
 * The console's surface onto `apps/fulfillment` — one number for the dashboard. Scoped by a
 * resolved `showIds[]`, like every other organizer read: the gateway proves ownership first.
 *
 * No `schema.ts` beside this: the result is a bare count, and a file declaring `number` would be
 * a file for its own sake.
 */
export const ORGANIZER_TICKETS_MESSAGE_PATTERNS = {
  CHECKED_IN_COUNT: 'organizer.tickets.checkedInCount',
} as const;

export interface OrganizerTicketsRpcContracts {
  [ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT]: Rpc<{
    payload: { showIds: string[] };
    result: number;
  }>;
}
