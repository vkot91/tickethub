import type {
  CreateShowDto,
  OrganizerShow,
  OrganizerShowsQuery,
  PosterUploadRequestDto,
  PosterUploadUrl,
  PublishChecklist,
  PutPricingDto,
  UpdateShowDto,
} from '../shows/schema';
import type { Rpc } from '../shape';

/**
 * The console's surface onto `apps/shows` — authoring, ownership and the dashboard's capacity.
 * A separate map from `SHOWS_MESSAGE_PATTERNS` because it is a separate audience with a separate
 * controller: the import line then says which surface a file talks to.
 *
 * The show *schemas* it carries stay in `../shows/schema` — one show resource, one file — and
 * only the console-specific shapes (stats, recent orders, the role flip) live in `./schema`.
 */
export const ORGANIZER_MESSAGE_PATTERNS = {
  CREATE: 'organizer.create',
  SHOW_IDS: 'organizer.showIds',
  MY_SHOWS: 'organizer.myShows',
  GET_SHOW: 'organizer.getShow',
  CREATE_SHOW: 'organizer.createShow',
  UPDATE_SHOW: 'organizer.updateShow',
  // Not DELETE_DRAFT: the service branches on the show's own status (draft → delete,
  // published → cancel in slice 4). The gateway cannot branch without reading a stale status.
  DELETE_SHOW: 'organizer.deleteShow',
  PUT_PRICING: 'organizer.putPricing',
  PUBLISH_CHECKLIST: 'organizer.publishChecklist',
  PUBLISH_SHOW: 'organizer.publishShow',
  POSTER_UPLOAD_URL: 'organizer.posterUploadUrl',
  // Seats on sale per show, batched. Organizer-only today — the buyer catalog never asks.
  CAPACITY: 'organizer.capacity',
} as const;

export interface OrganizerRpcContracts {
  [ORGANIZER_MESSAGE_PATTERNS.CREATE]: Rpc<{
    payload: { userId: string; name: string };
    result: string;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS]: Rpc<{
    payload: { userId: string };
    result: string[];
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.CAPACITY]: Rpc<{
    payload: { showIds: string[] };
    result: { showId: string; capacity: number }[];
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.MY_SHOWS]: Rpc<{
    payload: { userId: string } & OrganizerShowsQuery;
    result: OrganizerShow[];
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.GET_SHOW]: Rpc<{
    payload: { userId: string; showId: string };
    result: OrganizerShow;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.CREATE_SHOW]: Rpc<{
    payload: { userId: string; dto: CreateShowDto };
    result: OrganizerShow;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.UPDATE_SHOW]: Rpc<{
    payload: { userId: string; showId: string; dto: UpdateShowDto };
    result: OrganizerShow;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW]: Rpc<{
    payload: { userId: string; showId: string };
    result: void;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.PUT_PRICING]: Rpc<{
    payload: { userId: string; showId: string; dto: PutPricingDto };
    result: void;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.PUBLISH_CHECKLIST]: Rpc<{
    payload: { userId: string; showId: string };
    result: PublishChecklist;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.PUBLISH_SHOW]: Rpc<{
    payload: { userId: string; showId: string };
    result: void;
  }>;
  [ORGANIZER_MESSAGE_PATTERNS.POSTER_UPLOAD_URL]: Rpc<{
    payload: { userId: string; showId: string; dto: PosterUploadRequestDto };
    result: PosterUploadUrl;
  }>;
}
