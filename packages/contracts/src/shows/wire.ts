import type {
  CatalogPage,
  CatalogQuery,
  SeatMap,
  ShowCancelledEvent,
  ShowDetail,
  ShowPublishedEvent,
} from './schema';
import type { Rpc } from '../shape';

/** The buyer-facing catalog surface. The console's own reads live in `../organizer/wire`. */
export const SHOWS_MESSAGE_PATTERNS = {
  CATALOG: 'shows.catalog',
  DETAIL: 'shows.detail',
  SEAT_MAP: 'shows.seatMap',
} as const;

export const SHOW_ROUTING_KEYS = {
  SHOW_PUBLISHED: 'show.published',
  SHOW_CANCELLED: 'show.cancelled',
} as const;

export interface ShowsEventContracts {
  [SHOW_ROUTING_KEYS.SHOW_PUBLISHED]: ShowPublishedEvent;
  [SHOW_ROUTING_KEYS.SHOW_CANCELLED]: ShowCancelledEvent;
}

export interface ShowsRpcContracts {
  [SHOWS_MESSAGE_PATTERNS.CATALOG]: Rpc<{ payload: CatalogQuery; result: CatalogPage }>;
  [SHOWS_MESSAGE_PATTERNS.DETAIL]: Rpc<{ payload: { id: string }; result: ShowDetail }>;
  [SHOWS_MESSAGE_PATTERNS.SEAT_MAP]: Rpc<{ payload: { id: string }; result: SeatMap }>;
}
