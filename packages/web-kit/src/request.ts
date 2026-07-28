import type { ZodType } from 'zod';

export type ApiErrorKind =
  'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'expired' | 'validation' | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function kindForStatus(status: number, message: string): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 410) return 'expired';
  if (status === 422) return 'validation';
  if (status === 409) return /expired/i.test(message) ? 'expired' : 'conflict';

  return 'unknown';
}

interface ErrorBody {
  message?: string | string[];
}

function messageFrom(body: unknown, fallback: string): string {
  // Some errors come back as a bare JSON string rather than `{ message }`.
  if (typeof body === 'string') return body || fallback;

  const message = (body as ErrorBody | null)?.message;

  if (Array.isArray(message)) return message.join(', ');

  return message ?? fallback;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string;
}

/** Single place where a gateway response becomes either data or a typed ApiError. */
export async function request<T>(
  url: string,
  { body, token, headers, ...init }: RequestOptions = {},
  responseSchema?: ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = messageFrom(parsed, response.statusText);

    throw new ApiError(kindForStatus(response.status, message), response.status, message);
  }

  // A contract drift is a bug we want loud, not a silently mistyped render.
  return responseSchema ? responseSchema.parse(parsed) : (parsed as T);
}
