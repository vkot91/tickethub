import type { Rpc } from '../shape';
import type { VenueDetail, VenueSummary } from './schema';

/**
 * The shared venue catalogue. Its own surface because it is nobody's property: an organizer reads
 * it to pick a hall, and no audience owns a row in it.
 */
export const VENUES_MESSAGE_PATTERNS = {
  GET_LIST: 'venues.getList',
  GET_ONE: 'venues.getOne',
} as const;

export interface VenuesRpcContracts {
  // `Record<string, never>` and not `void`: the call still sends a body, it is just an empty one.
  [VENUES_MESSAGE_PATTERNS.GET_LIST]: Rpc<{
    payload: Record<string, never>;
    result: VenueSummary[];
  }>;
  [VENUES_MESSAGE_PATTERNS.GET_ONE]: Rpc<{
    payload: { venueId: string };
    result: VenueDetail;
  }>;
}
