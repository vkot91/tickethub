import { of } from 'rxjs';
import { RmqRecordBuilder } from '@nestjs/microservices';
import { RequestIdMiddleware } from './request-id.middleware';
import { RequestIdSerializer } from './request-id.serializer';
import { RequestIdInterceptor } from './request-id.interceptor';

const serializer = new RequestIdSerializer();
const middleware = new RequestIdMiddleware();

function req(headers: Record<string, string> = {}) {
  return { headers };
}
function res() {
  const set: Record<string, string> = {};
  return { setHeader: (k: string, v: string) => (set[k] = v), _headers: set };
}

// The full edge→wire→consumer chain: middleware seeds ALS, serializer stamps the
// header from ALS, interceptor restores it — the same id must survive end to end.
describe('request id propagation', () => {
  it('carries the inbound x-request-id from middleware onto the outgoing message', () => {
    const r = res();
    let onWire: string | undefined;

    middleware.use(req({ 'x-request-id': 'req-abc' }), r, () => {
      onWire = serializer.serialize({ data: { foo: 1 } }).options.headers['x-request-id'] as string;
    });

    expect(onWire).toBe('req-abc');
    expect(r._headers['x-request-id']).toBe('req-abc');
  });

  it('mints an id when none is inbound, and the consumer reads it back', (done) => {
    middleware.use(req(), res(), () => {
      const packet = serializer.serialize({ data: { foo: 1 } });
      const headers = packet.options.headers;

      const interceptor = new RequestIdInterceptor();
      const ctx = {
        switchToRpc: () => ({
          getContext: () => ({ getMessage: () => ({ properties: { headers } }) }),
        }),
      } as never;

      // getRequestId() inside handle() must equal the id the serializer stamped.
      interceptor
        .intercept(ctx, { handle: () => of(headers['x-request-id']) } as never)
        .subscribe((restored) => {
          expect(restored).toMatch(/[0-9a-f-]{36}/);
          expect(restored).toBe(headers['x-request-id']);
          done();
        });
    });
  });

  it('preserves a hand-built RmqRecord’s data/options while adding the header', () => {
    middleware.use(req({ 'x-request-id': 'req-xyz' }), res(), () => {
      const record = new RmqRecordBuilder({ foo: 1 }).setOptions({ priority: 5 }).build();

      const packet = serializer.serialize({ data: record });
      const options = packet.options as Record<string, unknown> & {
        headers: Record<string, unknown>;
      };

      expect(packet.data).toEqual({ foo: 1 });
      expect(options.priority).toBe(5);
      expect(options.headers['x-request-id']).toBe('req-xyz');
    });
  });
});
