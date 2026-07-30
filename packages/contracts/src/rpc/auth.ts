import type {
  AuthTokens,
  GetUserResponse,
  LoginDto,
  RefreshDto,
  RegisterDto,
  UserPayload,
} from '../dto/auth';
import type { AUTH_MESSAGE_PATTERNS } from '../events';
import type { Rpc } from './shape';

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
