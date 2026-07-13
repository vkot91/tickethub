import { of } from 'rxjs';
import { getRequestId } from './request-context';
import { RequestIdInterceptor } from './request-id.interceptor';

function ctx(headers: Record<string, unknown> | undefined) {
  return {
    switchToRpc: () => ({
      getContext: () => ({ getMessage: () => ({ properties: { headers } }) }),
    }),
  } as any;
}

describe('RequestIdInterceptor', () => {
  const interceptor = new RequestIdInterceptor();

  it('restores the request id from the RMQ header', (done) => {
    const next = { handle: () => of(getRequestId()) };

    interceptor.intercept(ctx({ 'x-request-id': 'req-123' }), next as any).subscribe((id) => {
      expect(id).toBe('req-123');
      done();
    });
  });

  it('falls back to a generated id when the header is absent', (done) => {
    const next = { handle: () => of(getRequestId()) };

    interceptor.intercept(ctx({}), next as any).subscribe((id) => {
      expect(id).toMatch(/[0-9a-f-]{36}/);
      done();
    });
  });
});
