import type { Rpc } from '../../shape';
import type { CheckInResult } from './schema';

/**
 * The console's surface onto `apps/fulfillment` — the dashboard's check-in number, and the gate
 * scanner. Both are scoped by a resolved `showIds[]`, like every other organizer read: the gateway
 * proves ownership first, so nothing in Fulfillment ever learns who owns what.
 */
export const ORGANIZER_TICKETS_MESSAGE_PATTERNS = {
  CHECKED_IN_COUNT: 'organizer.tickets.checkedInCount',
  CHECK_IN: 'organizer.tickets.checkIn',
} as const;

/**
 * A scan on the wire. Identical to what the gateway answers: Fulfillment owns the ticket, so it
 * owns the whole verdict, and the gateway adds nothing but the ownership check in front of it.
 * The alias stays because it is what the RPC contract below is written in terms of.
 */
export type CheckInScan = CheckInResult;

export interface OrganizerTicketsRpcContracts {
  [ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT]: Rpc<{
    payload: { showIds: string[] };
    result: number;
  }>;
  /**
   * `showId` is the gate — one show, already proved to belong to the caller. Singular and not a
   * list precisely so a scan cannot be scoped to "everything this organizer owns"; see
   * `checkInSchema`.
   */
  [ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECK_IN]: Rpc<{
    payload: { code: string; showId: string };
    result: CheckInScan;
  }>;
}
