import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ApiError } from './request';

/** Route handlers surface gateway and validation failures in the same shape the
 *  client's `request()` already knows how to read. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ message: error.issues.map((i) => i.message) }, { status: 422 });
  }

  // `fetch` rejects with a bare "fetch failed" TypeError when the gateway is not listening.
  // That is an upstream outage, not a bug in this app — say so instead of a blank 500.
  if (isConnectionFailure(error)) {
    return NextResponse.json({ message: 'The gateway is unreachable' }, { status: 502 });
  }

  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

function isConnectionFailure(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'fetch failed';
}
