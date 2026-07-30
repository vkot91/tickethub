import { ORDERS_MESSAGE_PATTERNS } from './orders/wire';
import { ORGANIZER_MESSAGE_PATTERNS } from './organizer/wire';
import type { RpcKey, RpcPayload, RpcResult } from './registry';

// The registry is types only, so its real test is that it compiles — ts-jest type-checks this
// file, and an @ts-expect-error that stops erroring fails the run. The runtime assertions below
// exist to pin the keys to their routing keys; `rpcRequest`'s own spec covers the call side.
describe('RpcContracts', () => {
  it('is keyed by the literal routing key', () => {
    const key: RpcKey = ORGANIZER_MESSAGE_PATTERNS.CAPACITY;

    expect(key).toBe('organizer.capacity');
  });

  it('rejects a routing key that is not an RPC', () => {
    // @ts-expect-error — 'show.published' is an event, not something rpcRequest can call
    const key: RpcKey = 'show.published';

    expect(key).toBe('show.published');
  });

  it('relates a key to its payload and result', () => {
    const payload: RpcPayload<typeof ORDERS_MESSAGE_PATTERNS.STATS> = { showIds: ['s1'] };
    const byTier: RpcResult<typeof ORDERS_MESSAGE_PATTERNS.STATS>['byTier'] = [];

    // @ts-expect-error — STATS takes showIds, not a bare showId
    const wrong: RpcPayload<typeof ORDERS_MESSAGE_PATTERNS.STATS> = { showId: 's1' };

    expect(payload.showIds).toEqual(['s1']);
    expect(byTier).toEqual([]);
    expect(wrong).toBeDefined();
  });
});
