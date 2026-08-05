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
  LIST: 'organizer.shows.list',
  // `id`/`title` only, for the dashboard's show picker — never the sales/capacity fan-out
  // `LIST` feeds the list screen with.
  TITLES: 'organizer.shows.titles',
  GET: 'organizer.shows.get',
  CREATE: 'organizer.shows.create',
  UPDATE: 'organizer.shows.update',
  // Not DELETE_DRAFT: the service branches on the show's own status (draft → delete,
  // published → cancel). The gateway cannot branch without reading a stale status.
  DELETE: 'organizer.shows.delete',
  UPDATE_PRICING: 'organizer.shows.updatePricing',
  // The read side of UPDATE_PRICING. Not folded into GET: the show list answers with the same
  // shape as GET, and every row would then carry a bands join no list screen renders.
  PRICING: 'organizer.shows.pricing',
  PUBLISH_CHECKLIST: 'organizer.shows.publishChecklist',
  PUBLISH: 'organizer.shows.publish',
  POSTER_UPLOAD_URL: 'organizer.shows.posterUploadUrl',
  // Per-show facts the console's numbers need, batched: the title, the seats on sale, and the
  // date the show went on sale. Organizer-only — the buyer catalog never asks, and the console
  // must not ask it: `user.shows.detail` 404s a draft, and the console authors drafts. The title
  // rides along rather than costing a second call, since it is a column on the same row scan.
  SUMMARIES: 'organizer.shows.summaries',
  // Seat id → "Section A · Row 3 · Seat 12", for exactly the seats asked about. The buyer's
  // `user.shows.seatMap` would answer this too, by hauling back a whole venue's geometry for a
  // handful of labels — and by 404ing on the drafts this audience owns.
  SEAT_LABELS: 'organizer.shows.seatLabels',
  // What to label a band in the dashboard's "sales by band" card. Deliberately not the buyer's
  // `user.shows.detail`: that reads the whole show row to drive a 404 the console does not need, and
  // it is the wrong audience — a draft 404s there, and the console authors drafts.
  BANDS: 'organizer.shows.bands',
  // Every show the caller owns. The gateway calls this first, then scopes each downstream
  // organizer read to the ids it comes back with — which is why no other service takes a `userId`.
  // It asks a shows question, so it is keyed as one; it used to sit in the profile map.
  IDS: 'organizer.shows.ids',
} as const;

/**
 * The organizer *account*, served by the same app. Keyed `organizer.profile.*` and not
 * `organizer.*`: `organizer` is the audience namespace every console key starts with, so leaving
 * these bare made the account look like the whole surface. `profile` is the resource, the same way
 * `shows` is in the map above.
 */
export const ORGANIZER_PROFILE_MESSAGE_PATTERNS = {
  CREATE: 'organizer.profile.create',
} as const;

export interface OrganizerProfileRpcContracts {
  [ORGANIZER_PROFILE_MESSAGE_PATTERNS.CREATE]: Rpc<{
    payload: { userId: string; name: string };
    result: string;
  }>;
}

export interface OrganizerShowsRpcContracts {
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.LIST]: Rpc<{
    payload: { userId: string } & OrganizerShowsQuery;
    result: OrganizerShow[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.TITLES]: Rpc<{
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
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.UPDATE_PRICING]: Rpc<{
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
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.SUMMARIES]: Rpc<{
    payload: { showIds: string[] };
    result: { showId: string; title: string; capacity: number; saleStartsAt: string | null }[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.SEAT_LABELS]: Rpc<{
    payload: { showId: string; seatIds: string[] };
    result: Record<string, string>;
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.BANDS]: Rpc<{
    payload: { showId: string };
    result: { id: string; name: string; tier: SeatTier }[];
  }>;
  [ORGANIZER_SHOWS_MESSAGE_PATTERNS.IDS]: Rpc<{
    payload: { userId: string };
    result: string[];
  }>;
}
