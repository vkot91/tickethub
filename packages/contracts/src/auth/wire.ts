import type { Rpc } from '../shape';
import type {
  AuthTokens,
  GetUserResponse,
  LoginDto,
  RefreshDto,
  RegisterDto,
  UserPayload,
} from './schema';

export const AUTH_MESSAGE_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  VALIDATE: 'auth.validate',
  GET_USER: 'auth.getUser',
  // Batched sibling of GET_USER: one call resolves a whole page of buyer emails.
  GET_USERS_BY_IDS: 'auth.getUsersByIds',
  BECOME_ORGANIZER: 'auth.becomeOrganizer',
} as const;

// Auth publishes no domain events: it has no outbox table, and the only way onto the broker is
// through one. `user.registered` used to go out fire-and-forget past the outbox, with no consumer
// on the other end — it is gone rather than half-wired. Reinstate it here, with an outbox and a
// poller, when something actually needs to hear about a registration.
export interface AuthRpcContracts {
  [AUTH_MESSAGE_PATTERNS.REGISTER]: Rpc<{ payload: RegisterDto; result: AuthTokens }>;
  [AUTH_MESSAGE_PATTERNS.LOGIN]: Rpc<{ payload: LoginDto; result: AuthTokens }>;
  [AUTH_MESSAGE_PATTERNS.REFRESH]: Rpc<{ payload: RefreshDto; result: AuthTokens }>;
  [AUTH_MESSAGE_PATTERNS.VALIDATE]: Rpc<{
    payload: { accessToken: string };
    result: UserPayload;
  }>;
  [AUTH_MESSAGE_PATTERNS.GET_USER]: Rpc<{
    payload: { userId: string };
    result: GetUserResponse;
  }>;
  [AUTH_MESSAGE_PATTERNS.GET_USERS_BY_IDS]: Rpc<{
    payload: { ids: string[] };
    result: { id: string; email: string }[];
  }>;
  [AUTH_MESSAGE_PATTERNS.BECOME_ORGANIZER]: Rpc<{
    payload: { userId: string };
    result: AuthTokens;
  }>;
}
