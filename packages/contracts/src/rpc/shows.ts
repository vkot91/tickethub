import type { CatalogPage, CatalogQuery, SeatMap, ShowDetail } from '../dto/shows';
import type { SHOWS_MESSAGE_PATTERNS } from '../events';
import type { Rpc } from './shape';

/** The buyer-facing catalog surface. The console's own reads live in `./organizer`. */
export interface ShowsRpcContracts {
  [SHOWS_MESSAGE_PATTERNS.CATALOG]: Rpc<{ payload: CatalogQuery; result: CatalogPage }>;
  [SHOWS_MESSAGE_PATTERNS.DETAIL]: Rpc<{ payload: { id: string }; result: ShowDetail }>;
  [SHOWS_MESSAGE_PATTERNS.SEAT_MAP]: Rpc<{ payload: { id: string }; result: SeatMap }>;
}
