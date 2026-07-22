import 'reflect-metadata';
import { of } from 'rxjs';
import { RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE } from '@tickethub/contracts';
import { RequestIdMiddleware } from './request-id.middleware';
import { publishEvent } from './rmq.config';
import { RequestIdInterceptor } from './request-id.interceptor';

const middleware = new RequestIdMiddleware();

function req(headers: Record<string, string> = {}) {
  return { headers };
}
function res() {
  const set: Record<string, string> = {};
  return { setHeader: (k: string, v: string) => (set[k] = v), _headers: set };
}

// Capture what publishEvent puts on the wire.
function amqpSpy() {
  const calls: { exchange: string; routingKey: string; headers: Record<string, unknown> }[] = [];
  const amqp = {
    publish: (
      exchange: string,
      routingKey: string,
      _msg: unknown,
      opts: { headers: Record<string, unknown> },
    ) => {
      calls.push({ exchange, routingKey, headers: opts.headers });
      return Promise.resolve(true);
    },
  } as unknown as AmqpConnection;
  return { amqp, calls };
}

// golevelup consumer context: handler carries RABBIT_HANDLER metadata, ConsumeMessage at arg 1.
function rabbitCtx(headers: Record<string, unknown>) {
  const handler = () => undefined;
  Reflect.defineMetadata(RABBIT_HANDLER, {}, handler);
  return {
    getHandler: () => handler,
    getArgByIndex: (i: number) => (i === 1 ? { properties: { headers } } : undefined),
  } as never;
}

// The full edge→wire→consumer chain: middleware seeds ALS, publishEvent stamps the header
// from ALS, interceptor restores it — the same id must survive end to end.
describe('request id propagation', () => {
  it('carries the inbound x-request-id from middleware onto the published event', async () => {
    const { amqp, calls } = amqpSpy();
    const r = res();

    await new Promise<void>((resolve) => {
      middleware.use(req({ 'x-request-id': 'req-abc' }), r, () => {
        void publishEvent(amqp, 'payment.succeeded', { foo: 1 }).then(resolve);
      });
    });

    expect(calls[0].exchange).toBe(EVENTS_EXCHANGE);
    expect(calls[0].routingKey).toBe('payment.succeeded');
    expect(calls[0].headers['x-request-id']).toBe('req-abc');
    expect(r._headers['x-request-id']).toBe('req-abc');
  });

  it('mints an id when none is inbound, and the consumer reads it back', async () => {
    const { amqp, calls } = amqpSpy();

    await new Promise<void>((resolve) => {
      middleware.use(req(), res(), () => {
        void publishEvent(amqp, 'payment.succeeded', { foo: 1 }).then(resolve);
      });
    });

    const onWire = calls[0].headers['x-request-id'] as string;
    expect(onWire).toMatch(/[0-9a-f-]{36}/);

    const interceptor = new RequestIdInterceptor();
    const restored = await new Promise<string>((resolve) => {
      interceptor
        .intercept(rabbitCtx({ 'x-request-id': onWire }), {
          handle: () => of(onWire),
        } as never)
        .subscribe((v) => resolve(v as string));
    });

    expect(restored).toBe(onWire);
  });
});
