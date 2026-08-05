import type { Rpc } from '../../shape';
import type { SeatTier } from '../schema';
import type {
  CreateShowDto,
  OrganizerShow,
  OrganizerShowsQuery,
  PosterUploadRequestDto,
  PosterUploadUrl,
  PublishChecklist,
  PutPricingDto,
  ShowName,
  ShowPricing,
  UpdateShowDto,
} from './schema';

/**
 * The console's surface onto `apps/shows`. Keyed `organizer.shows.*`: the audience is first
 * because it is what decides the guard, the service second because it is what decides the queue.
 * A key can then only be read one way, and `admin.shows.*` slots in beside it without a rethink.
 *
 * The action names drop their `_SHOW` suffix — the map already says `shows`, so `GET` is
 * unambiguous and `ORGANIZER_SHOWS_MESSAGE_PATTERNS.GET_SHOW` was saying it twice.
 */
export const ORGANIZER_SHOWS_MESSAGE_PATTERNS = {
  MY_SHOWS: 'organizer.shows.myShows',
  // `id`/`title` only, for the dashboard's show picker — never the sales/capacity fan-out
  // `MY_SHOWS` feeds the list screen with.
  NAMES: 'organizer.shows.names',
  GET: 'organizer.shows.get',
  CREATE: 'organizer.shows.create',
  UPDATE: 'organizer.shows.update',
  // Not DELETE_DRAFT: the service branches on the show's own status (draft → delete,
  // published → cancel). The gateway cannot branch without reading a stale status.
  DELETE: 'organizer.shows.delete',
  PUT_PRICING: 'organizer.shows.putPricing',
  // The read side of PUT_PRICING. Not folded into GET: the show list answers with the same
  // shape as GET, and every row would then carry a bands join no list screen renders.
  PRICING: 'organizer.shows.pricing',
  PUBLISH_CHECKLIST: 'organizer.shows.publishChecklist',
  PUBLISH: 'organizer.shows.publish',
  POSTER_UPLOAD_URL: 'organizer.shows.posterUploadUrl',
  // Per-show facts the console's numbers need, batched: seats on sale, and the date the show
  // went on sale. Organizer-only — the buyer catalog never asks. `saleStartsAt` rides along
  // rather than costing its own round trip, since it comes off the same row scan.
  CAPACITY: 'organizer.shows.capacity',
  // What to label a band in the dashboard's "sales by band" card. Deliberately not the buyer's
  // `shows.detail`: that reads the whole show row to drive a 404 the console does not need, and
  // it is the wrong audience — a draft 404s there, and the console authors drafts.
  TIER_NAMES: 'organizer.shows.tierNames',
} as const;

export interface OrganizerShowsRpcContracts {
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.MY_SHOWS]: Rpc<{
    payload: { userId: string } & OrganizerShowsQuery;
    result: OrganizerShow[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.NAMES]: Rpc<{
    payload: { userId: string };
    result: ShowName[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.GET]: Rpc<{
    payload: { userId: string; showId: string };
    result: OrganizerShow;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.CREATE]: Rpc<{
    payload: { userId: string; dto: CreateShowDto };
    result: OrganizerShow;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.UPDATE]: Rpc<{
    payload: { userId: string; showId: string; dto: UpdateShowDto };
    result: OrganizerShow;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.DELETE]: Rpc<{
    payload: { userId: string; showId: string };
    result: void;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUT_PRICING]: Rpc<{
    payload: { userId: string; showId: string; dto: PutPricingDto };
    result: void;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.PRICING]: Rpc<{
    payload: { userId: string; showId: string };
    result: ShowPricing;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUBLISH_CHECKLIST]: Rpc<{
    payload: { userId: string; showId: string };
    result: PublishChecklist;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUBLISH]: Rpc<{
    payload: { userId: string; showId: string };
    result: void;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.POSTER_UPLOAD_URL]: Rpc<{
    payload: { userId: string; showId: string; dto: PosterUploadRequestDto };
    result: PosterUploadUrl;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY]: Rpc<{
    payload: { showIds: string[] };
    result: { showId: string; capacity: number; saleStartsAt: string | null }[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.TIER_NAMES]: Rpc<{
    payload: { showId: string };
    result: { id: string; name: string; tier: SeatTier }[];
  }>;
}
