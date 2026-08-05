import type { Rpc } from '../../shape';
import type { CatalogPage, CatalogQuery, SeatMap, ShowDetail } from './schema';

/**
 * The buyer-facing catalog surface, keyed `user.shows.*`. The buyer used to be the unprefixed
 * default, which was defensible with two audiences and stops being so with three: `shows.catalog`
 * no longer states who may call it, and `grep '^user\.'` is impossible while `organizer.` and
 * `admin.` grep cleanly. Every audience says its name now.
 */
export const SHOWS_MESSAGE_PATTERNS = {
  CATALOG: 'user.shows.catalog',
  DETAIL: 'user.shows.detail',
  SEAT_MAP: 'user.shows.seatMap',
} as const;

export interface ShowsRpcContracts {
  [SHOWS_MESSAGE_PATTERNS.CATALOG]: Rpc<{ payload: CatalogQuery; result: CatalogPage }>;
  [SHOWS_MESSAGE_PATTERNS.DETAIL]: Rpc<{ payload: { id: string }; result: ShowDetail }>;
  [SHOWS_MESSAGE_PATTERNS.SEAT_MAP]: Rpc<{ payload: { id: string }; result: SeatMap }>;
}
