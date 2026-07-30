import type {
  CreateShowDto,
  OrganizerShow,
  OrganizerShowsQuery,
  PosterUploadRequestDto,
  PosterUploadUrl,
  PublishChecklist,
  PutPricingDto,
  UpdateShowDto,
} from './schema';
import type { Rpc } from '../../shape';

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
  GET: 'organizer.shows.get',
  CREATE: 'organizer.shows.create',
  UPDATE: 'organizer.shows.update',
  // Not DELETE_DRAFT: the service branches on the show's own status (draft → delete,
  // published → cancel). The gateway cannot branch without reading a stale status.
  DELETE: 'organizer.shows.delete',
  PUT_PRICING: 'organizer.shows.putPricing',
  PUBLISH_CHECKLIST: 'organizer.shows.publishChecklist',
  PUBLISH: 'organizer.shows.publish',
  POSTER_UPLOAD_URL: 'organizer.shows.posterUploadUrl',
  // Seats on sale per show, batched. Organizer-only — the buyer catalog never asks.
  CAPACITY: 'organizer.shows.capacity',
} as const;

export interface OrganizerShowsRpcContracts {
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.MY_SHOWS]: Rpc<{
    payload: { userId: string } & OrganizerShowsQuery;
    result: OrganizerShow[];
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
    result: { showId: string; capacity: number }[];
  }>;
}
