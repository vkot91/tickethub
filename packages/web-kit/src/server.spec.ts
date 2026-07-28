import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const { createServerSession } = await import('./server');

const session = createServerSession({
  accessCookie: 'th_at',
  refreshCookie: 'th_rt',
  gatewayUrl: () => 'http://gateway',
});

/** A GET the BFF can forward: no cookies, no body, one path. */
function pdfRequest(): NextRequest {
  return {
    method: 'GET',
    headers: new Headers(),
    cookies: { get: () => undefined },
    nextUrl: { search: '' },
    text: () => Promise.resolve(''),
  } as unknown as NextRequest;
}

const pdfPath = { params: Promise.resolve({ path: ['tickets', 't-1', 'pdf'] }) };

function gatewayResponds(headers: Record<string, string>) {
  return vi.fn().mockResolvedValue(new Response('%PDF-1.7', { status: 200, headers }));
}

afterEach(() => vi.unstubAllGlobals());

describe('gatewayRoute response headers', () => {
  // Without this the browser falls back to the URL's last segment, and every ticket downloads
  // as `pdf.pdf` regardless of the name the origin picked.
  it('forwards content-disposition so <a download> gets the origin filename', async () => {
    vi.stubGlobal(
      'fetch',
      gatewayResponds({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="ticket-4F2A.pdf"',
      }),
    );

    const response = await session.gatewayRoute(pdfRequest(), pdfPath);

    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="ticket-4F2A.pdf"',
    );
    expect(response.headers.get('content-type')).toBe('application/pdf');
  });

  it('omits content-disposition when the gateway sends none', async () => {
    vi.stubGlobal('fetch', gatewayResponds({ 'content-type': 'application/json' }));

    const response = await session.gatewayRoute(pdfRequest(), pdfPath);

    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});
