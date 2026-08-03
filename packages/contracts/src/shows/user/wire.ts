import type { Rpc } from '../../shape';
import type { CatalogPage, CatalogQuery, SeatMap, ShowDetail } from './schema';

/**
 * The buyer-facing catalog surface. Unprefixed keys: the buyer is the default audience, so
 * `shows.catalog` reads as "the catalog" and every other audience says whose it is
 * (`organizer.shows.*`).
 */
export const SHOWS_MESSAGE_PATTERNS = {
  CATALOG: 'shows.catalog',
  DETAIL: 'shows.detail',
  SEAT_MAP: 'shows.seatMap',
} as const;

export interface ShowsRpcContracts {
  [SHOWS_MESSAGE_PATTERNS.CATALOG]: Rpc<{ payload: CatalogQuery; result: CatalogPage }>;
  [SHOWS_MESSAGE_PATTERNS.DETAIL]: Rpc<{ payload: { id: string }; result: ShowDetail }>;
  [SHOWS_MESSAGE_PATTERNS.SEAT_MAP]: Rpc<{ payload: { id: string }; result: SeatMap }>;
}
