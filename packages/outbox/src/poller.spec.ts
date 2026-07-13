import { OutboxPoller } from './poller';
import { of } from 'rxjs';

describe('OutboxPoller.drain', () => {
  it('emits each unpublished row then marks it published', async () => {
    const unpublished = [{ id: 'o1', routingKey: 'order.paid', payload: { messageId: 'm1' } }];
    const marked: string[] = [];
    const emitted: Array<[string, unknown]> = [];

    const db = {
      transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({ for: () => ({ limit: async () => unpublished }) }),
            }),
          }),
          update: () => ({
            set: () => ({
              where: async (w: unknown) => {
                marked.push('o1');
                return w;
              },
            }),
          }),
        }),
    };
    const client = {
      emit: (rk: string, p: unknown) => {
        emitted.push([rk, p]);
        return of(null);
      },
    };

    const poller = new OutboxPoller(db as never, {} as never, client as never, 50);
    await poller.drain();

    expect(emitted).toEqual([['order.paid', { messageId: 'm1' }]]);
    expect(marked).toEqual(['o1']);
  });

  it('polls on an interval and stops cleanly, swallowing drain errors', async () => {
    jest.useFakeTimers();
    const db = { transaction: jest.fn().mockRejectedValue(new Error('boom')) };
    const poller = new OutboxPoller(db as never, {} as never, {} as never, 10);

    poller.onModuleInit();
    jest.advanceTimersByTime(10);
    await Promise.resolve(); // let the rejected drain settle

    expect(db.transaction).toHaveBeenCalled();

    poller.onModuleDestroy();
    db.transaction.mockClear();
    jest.advanceTimersByTime(50);
    expect(db.transaction).not.toHaveBeenCalled(); // timer cleared

    jest.useRealTimers();
  });
});
