import type { VenueDetail, VenueSummary } from '../dto/venue';
import type { VENUES_MESSAGE_PATTERNS } from '../events';
import type { Rpc } from './shape';

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
