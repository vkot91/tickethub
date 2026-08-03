import { ORGANIZER_ORDERS_MESSAGE_PATTERNS } from './orders/organizer/wire';
import type { RpcKey, RpcPayload, RpcResult } from './registry';
import { ORGANIZER_SHOWS_MESSAGE_PATTERNS } from './shows/organizer/wire';

// The registry is types only, so its real test is that it compiles — ts-jest type-checks this
// file, and an @ts-expect-error that stops erroring fails the run. The runtime assertions below
// exist to pin the keys to their routing keys; `rpcRequest`'s own spec covers the call side.
describe('RpcContracts', () => {
  it('is keyed by the literal routing key', () => {
    const key: RpcKey = ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY;

    expect(key).toBe('organizer.shows.capacity');
  });

  it('rejects a routing key that is not an RPC', () => {
    // @ts-expect-error — 'show.published' is an event, not something rpcRequest can call
    const key: RpcKey = 'show.published';

    expect(key).toBe('show.published');
  });

  it('relates a key to its payload and result', () => {
    const payload: RpcPayload<typeof ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS> = {
      showIds: ['s1'],
    };
    const byTier: RpcResult<typeof ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS>['byTier'] = [];

    // @ts-expect-error — STATS takes showIds, not a bare showId
    const wrong: RpcPayload<typeof ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS> = { showId: 's1' };

    expect(payload.showIds).toEqual(['s1']);
    expect(byTier).toEqual([]);
    expect(wrong).toBeDefined();
  });

  // The old keys are gone, not aliased: a caller still saying `orders.stats` must not compile.
  it('no longer accepts the un-namespaced organizer keys', () => {
    // @ts-expect-error — renamed to 'organizer.orders.stats'
    const stats: RpcKey = 'orders.stats';
    // @ts-expect-error — renamed to 'organizer.shows.myShows'
    const myShows: RpcKey = 'organizer.myShows';

    expect([stats, myShows]).toHaveLength(2);
  });
});
