import { Logger } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import type { TicketPdfReadyEvent } from '@tickethub/contracts';
import { NotifyController } from './notify.controller';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';

const pdfReady: TicketPdfReadyEvent = {
  messageId: MESSAGE_ID,
  orderId: ORDER_ID,
  userId: USER_ID,
};

interface FakeOptions {
  // Message ids already committed to fulfillment.processed_messages.
  committedMessageIds?: string[];
  // If set, the fake queue.add call throws this error, before the caller's transaction commits.
  addFails?: Error;
}

function makeFakes({ committedMessageIds = [], addFails }: FakeOptions = {}) {
  const processedMessageIds = new Set(committedMessageIds);
  const added: { name: string; data: unknown; opts: unknown }[] = [];

  const tx = {};

  const db = {
    transaction: async <T>(fn: (handle: typeof tx) => Promise<T> | T): Promise<T> => {
      // Mirrors a real Postgres transaction: a thrown error rolls back every write the
      // callback made through it, so the inbox claim below is undone along with it.
      const claimedBeforeThisAttempt = new Set(processedMessageIds);

      try {
        return await fn(tx);
      } catch (err) {
        processedMessageIds.clear();
        for (const id of claimedBeforeThisAttempt) processedMessageIds.add(id);
        throw err;
      }
    },
  };

  const queue = {
    add: jest.fn(async (name: string, data: unknown, opts: unknown) => {
      if (addFails) throw addFails;
      added.push({ name, data, opts });
    }),
  };

  // Mirrors InboxRepository: insert-on-conflict, so the claim is only true on a replay.
  const inbox = {
    alreadyProcessed: jest.fn(async (_tx: unknown, messageId: string) => {
      if (processedMessageIds.has(messageId)) return true;

      processedMessageIds.add(messageId);

      return false;
    }),
  };

  return { db, tx, queue, inbox, added, processedMessageIds };
}

const controllerFor = (fakes: ReturnType<typeof makeFakes>) =>
  new NotifyController(fakes.db as never, fakes.queue as never, fakes.inbox as never);

describe('NotifyController.onPdfReady', () => {
  beforeEach(() => {
    // The handler logs the failure it dead-letters; keep the suite output clean.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('enqueues send-ticket-email keyed by orderId for a fresh event', async () => {
    const fakes = makeFakes();

    await controllerFor(fakes).onPdfReady(pdfReady);

    expect(fakes.added).toHaveLength(1);

    const [job] = fakes.added;
    expect(job.name).toBe('send-ticket-email');
    expect(job.data).toEqual({ orderId: ORDER_ID, userId: USER_ID });
    expect(job.opts).toEqual(expect.objectContaining({ jobId: ORDER_ID }));
  });

  it('claims the message inside the same transaction as the enqueue', async () => {
    const fakes = makeFakes();

    await controllerFor(fakes).onPdfReady(pdfReady);

    expect(fakes.inbox.alreadyProcessed).toHaveBeenCalledWith(fakes.tx, MESSAGE_ID);
  });

  it('does not enqueue a duplicate delivery of the same messageId', async () => {
    const fakes = makeFakes({ committedMessageIds: [MESSAGE_ID] });

    await controllerFor(fakes).onPdfReady(pdfReady);

    expect(fakes.queue.add).not.toHaveBeenCalled();
    expect(fakes.added).toEqual([]);
  });

  // golevelup requeues immediately, with no backoff, on an uncaught throw. With Redis down that
  // is a tight loop: transaction, insert, fail, roll back, redeliver — hammering Postgres for as
  // long as the outage lasts. Dead-lettering instead is what the queue's DLX is there for.
  it('dead-letters instead of throwing when the enqueue fails', async () => {
    const fakes = makeFakes({ addFails: new Error('redis down') });

    const result = await controllerFor(fakes).onPdfReady(pdfReady);

    expect(result).toBeInstanceOf(Nack);
    expect(result).toEqual(expect.objectContaining({ requeue: false }));
  });

  it('logs the failure it dead-letters, with the order and message ids', async () => {
    const fakes = makeFakes({ addFails: new Error('redis down') });

    await controllerFor(fakes).onPdfReady(pdfReady);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: MESSAGE_ID, orderId: ORDER_ID }),
      expect.stringContaining(ORDER_ID),
    );
  });

  it('leaves the message unclaimed when the enqueue fails, so a replay retries', async () => {
    const fakes = makeFakes({ addFails: new Error('redis down') });

    await controllerFor(fakes).onPdfReady(pdfReady);

    // The failed attempt must not have persisted the claim.
    expect(fakes.processedMessageIds.has(MESSAGE_ID)).toBe(false);

    // A genuine replay (same messageId, queue now healthy) must actually enqueue.
    fakes.queue.add.mockImplementation(async (name: string, data: unknown, opts: unknown) => {
      fakes.added.push({ name, data, opts });
    });

    await controllerFor(fakes).onPdfReady({ ...pdfReady, messageId: MESSAGE_ID });

    expect(fakes.added).toHaveLength(1);
    expect(fakes.added[0]).toEqual({
      name: 'send-ticket-email',
      data: { orderId: ORDER_ID, userId: USER_ID },
      opts: expect.objectContaining({ jobId: ORDER_ID }),
    });
  });
});
