import type { OutboxRepository } from './outbox.repository';
import { OutboxPoller } from './poller';

// The poller owns no SQL any more — it orchestrates the repository, so that is what we stub.
function fakeOutbox(rows: Array<{ id: string; routingKey: string; payload: unknown }>) {
  const marked: string[] = [];

  const outbox = {
    marked,
    withTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    fetchUnpublished: jest.fn(async () => rows),
    markPublished: jest.fn(async (_tx: unknown, id: string) => {
      marked.push(id);
    }),
  };

  return outbox as typeof outbox & OutboxRepository;
}

describe('OutboxPoller.drain', () => {
  it('publishes each unpublished row then marks it published', async () => {
    const outbox = fakeOutbox([
      { id: 'o1', routingKey: 'order.paid', payload: { messageId: 'm1' } },
    ]);
    const published: Array<[string, unknown]> = [];

    // omit intervalMs/batch here to exercise their defaults
    const poller = new OutboxPoller(outbox, (rk, p) => {
      published.push([rk, p]);
      return Promise.resolve();
    });

    await poller.drain();

    expect(published).toEqual([['order.paid', { messageId: 'm1' }]]);
    expect(outbox.marked).toEqual(['o1']);
    expect(outbox.fetchUnpublished).toHaveBeenCalledWith({}, 100);
  });

  it('leaves the row unmarked when publishing fails, so it is retried', async () => {
    const outbox = fakeOutbox([{ id: 'o1', routingKey: 'order.paid', payload: {} }]);
    const poller = new OutboxPoller(outbox, () => Promise.reject(new Error('broker down')));

    await expect(poller.drain()).rejects.toThrow('broker down');

    expect(outbox.markPublished).not.toHaveBeenCalled();
  });

  it('polls on an interval and stops cleanly, swallowing drain errors', async () => {
    jest.useFakeTimers();
    const outbox = fakeOutbox([]);
    outbox.withTransaction.mockRejectedValue(new Error('boom'));
    const poller = new OutboxPoller(outbox, jest.fn().mockResolvedValue(undefined), 10, 5);

    poller.onModuleInit();
    jest.advanceTimersByTime(10);
    await Promise.resolve(); // let the rejected drain settle

    expect(outbox.withTransaction).toHaveBeenCalled();

    poller.onModuleDestroy();
    outbox.withTransaction.mockClear();
    jest.advanceTimersByTime(50);
    expect(outbox.withTransaction).not.toHaveBeenCalled(); // timer cleared

    jest.useRealTimers();
  });
});
