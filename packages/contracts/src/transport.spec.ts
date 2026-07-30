import { EVENTS_EXCHANGE, EVENTS_QUEUES, RPC_EXCHANGE } from './transport';

// These strings are declared in code but they live in the broker: renaming one orphans every
// queue already bound to it. Pinning them makes that a failing test rather than a silent
// no-consumer.
describe('transport names', () => {
  it('pins the exchange names', () => {
    expect(EVENTS_EXCHANGE).toBe('tickethub.events');
    expect(RPC_EXCHANGE).toBe('tickethub.rpc');
  });

  it('names every event queue after its consumer, then its event', () => {
    for (const [key, queue] of Object.entries(EVENTS_QUEUES)) {
      const [service] = queue.split('.');

      expect(key.toLowerCase().startsWith(service)).toBe(true);
      expect(queue).toMatch(/^[a-z]+\.[a-z-]+$/);
    }
  });
});
