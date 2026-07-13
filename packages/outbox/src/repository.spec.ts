import { OutboxRepository, alreadyProcessed } from './index';

function fakeTx(insertResult: unknown[] = []) {
  const calls: unknown[] = [];
  return {
    calls,
    insert() {
      return {
        values(v: unknown) {
          calls.push(v);
          return {
            onConflictDoNothing() {
              return { returning: async () => insertResult };
            },
            returning: async () => insertResult,
          };
        },
      };
    },
  } as never;
}

describe('OutboxRepository', () => {
  it('enqueue inserts a routing key + payload row', async () => {
    const tx = fakeTx();
    await new OutboxRepository().enqueue(tx, {} as never, {
      routingKey: 'order.paid',
      payload: { messageId: 'm1' },
    });
    expect((tx as never as { calls: unknown[] }).calls[0]).toMatchObject({
      routingKey: 'order.paid',
    });
  });

  it('alreadyProcessed returns false on first insert, true on conflict', async () => {
    expect(await alreadyProcessed(fakeTx([{ messageId: 'm1' }]), {} as never, 'm1')).toBe(false);
    expect(await alreadyProcessed(fakeTx([]), {} as never, 'm1')).toBe(true);
  });
});
