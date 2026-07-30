import type {
  CreateShowDto,
  OrganizerShow,
  OrganizerShowsQuery,
  PosterUploadRequestDto,
  PosterUploadUrl,
  PublishChecklist,
  PutPricingDto,
  UpdateShowDto,
} from '../dto/shows';
import type { ORGANIZER_MESSAGE_PATTERNS } from '../events';
import type { Rpc } from './shape';

/** The console's surface onto `apps/shows` — authoring, ownership and the dashboard's capacity. */
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
