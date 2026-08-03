import 'reflect-metadata';

import { RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { of } from 'rxjs';

import { getRequestId } from './request-context';
import { RequestIdInterceptor } from './request-id.interceptor';

// isRabbitContext checks the handler for RABBIT_HANDLER metadata; golevelup passes the raw
// ConsumeMessage as arg index 1. Mock both to look like a real @RabbitSubscribe invocation.
function rabbitCtx(headers: Record<string, unknown> | undefined) {
  const handler = () => undefined;
  Reflect.defineMetadata(RABBIT_HANDLER, {}, handler);
  return {
    getHandler: () => handler,
    getArgByIndex: (i: number) => (i === 1 ? { properties: { headers } } : undefined),
  } as never;
}

// A plain HTTP/other context — no RABBIT_HANDLER metadata.
function httpCtx() {
  const handler = () => undefined;
  return { getHandler: () => handler, getArgByIndex: () => undefined } as never;
}

describe('RequestIdInterceptor', () => {
  const interceptor = new RequestIdInterceptor();

  it('restores the request id from the AMQP header', (done) => {
    const next = { handle: () => of(getRequestId()) };

    interceptor
      .intercept(rabbitCtx({ 'x-request-id': 'req-123' }), next as never)
      .subscribe((id) => {
        expect(id).toBe('req-123');
        done();
      });
  });

  it('falls back to a generated id when the header is absent', (done) => {
    const next = { handle: () => of(getRequestId()) };

    interceptor.intercept(rabbitCtx({}), next as never).subscribe((id) => {
      expect(id).toMatch(/[0-9a-f-]{36}/);
      done();
    });
  });

  it('passes through untouched for a non-Rabbit context', (done) => {
    const next = { handle: () => of('passthrough') };

    interceptor.intercept(httpCtx(), next as never).subscribe((v) => {
      expect(v).toBe('passthrough');
      done();
    });
  });
});
