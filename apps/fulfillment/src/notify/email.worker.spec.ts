import { Logger } from '@nestjs/common';
import { sendTicketEmail, startEmailWorker, type EmailDeps } from './email.worker';

type FailedJob = {
  data: { orderId: string; userId: string };
  attemptsMade: number;
  opts: { attempts?: number };
};
type FailedListener = (job: FailedJob | undefined, error: Error) => void;
type ErrorListener = (error: Error) => void;

// Capture the processor BullMQ would run, plus the lifecycle listeners registered on the worker,
// without a real Redis connection (mirrors apps/orders/src/release.worker.spec.ts).
const processors: Array<(job: { data: { orderId: string; userId: string } }) => Promise<void>> = [];
const failedListeners: FailedListener[] = [];
const errorListeners: ErrorListener[] = [];

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_queue: string, processor: unknown) => {
    processors.push(processor as (typeof processors)[number]);

    return {
      name: _queue,
      on: (eventName: string, listener: unknown) => {
        if (eventName === 'failed') failedListeners.push(listener as FailedListener);
        if (eventName === 'error') errorListeners.push(listener as ErrorListener);
      },
    };
  }),
}));

const ORDER_ID = 'o1';
const USER_ID = 'u1';
const BUYER_EMAIL = 'buyer@x.com';
const PDF_BYTES = Buffer.from('%PDF-1.7');

function makeDeps(overrides: { send?: jest.Mock } = {}) {
  const send = overrides.send ?? jest.fn().mockResolvedValue(undefined);
  const request = jest.fn().mockResolvedValue({ userId: USER_ID, email: BUYER_EMAIL });
  const get = jest.fn().mockResolvedValue(PDF_BYTES);

  const deps: EmailDeps = {
    amqp: { request } as never,
    storage: { get } as never,
    mailer: { send } as never,
  };

  return { deps, send, request, get };
}

describe('sendTicketEmail', () => {
  it('fetches the email, attaches the PDF, and sends via SMTP', async () => {
    const { deps, send, request, get } = makeDeps();

    await sendTicketEmail(deps, { orderId: ORDER_ID, userId: USER_ID });

    // Falsifies: wrong RPC payload (e.g. sending orderId instead of userId to auth.getUser).
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'auth.getUser', payload: { userId: USER_ID } }),
    );

    // Falsifies: fetching the wrong S3 key (e.g. missing '.pdf' or using userId instead of orderId).
    expect(get).toHaveBeenCalledWith('o1.pdf');

    // Falsifies: sending to the wrong address, missing/misnamed/wrong-content attachment.
    // The from address moved to @tickethub/mailer, which binds it once at construction.
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BUYER_EMAIL,
        attachments: [
          expect.objectContaining({
            filename: 'ticket-o1.pdf',
            content: PDF_BYTES,
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
  });

  it('rethrows when SMTP fails so BullMQ retries', async () => {
    const smtpError = new Error('SMTP connection refused');
    const { deps } = makeDeps({ send: jest.fn().mockRejectedValue(smtpError) });

    // Falsifies: a try/catch that swallows the SMTP failure instead of letting BullMQ retry.
    await expect(sendTicketEmail(deps, { orderId: ORDER_ID, userId: USER_ID })).rejects.toThrow(
      'SMTP connection refused',
    );
  });
});

describe('startEmailWorker', () => {
  beforeEach(() => {
    processors.length = 0;
    failedListeners.length = 0;
    errorListeners.length = 0;

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('delegates a send-ticket-email job to sendTicketEmail', async () => {
    const { deps, send } = makeDeps();

    startEmailWorker(deps, { host: 'localhost', port: 6379 });

    await processors[0]({ data: { orderId: ORDER_ID, userId: USER_ID } });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: BUYER_EMAIL }));
  });

  // Without a 'failed' listener a job that burns all 5 attempts vanishes silently: the buyer
  // never gets the ticket and nothing outside Redis records why.
  it('logs a job that has exhausted its attempts, with the order id and the cause', () => {
    const { deps } = makeDeps();
    const smtpError = new Error('SMTP connection refused');

    startEmailWorker(deps, { host: 'localhost', port: 6379 });

    expect(failedListeners).toHaveLength(1);

    failedListeners[0](
      { data: { orderId: ORDER_ID, userId: USER_ID }, attemptsMade: 5, opts: { attempts: 5 } },
      smtpError,
    );

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, attemptsMade: 5, err: smtpError }),
      expect.stringContaining('gave up'),
    );
  });

  it('logs an intermediate failure as a retry rather than a give-up', () => {
    const { deps } = makeDeps();

    startEmailWorker(deps, { host: 'localhost', port: 6379 });

    failedListeners[0](
      { data: { orderId: ORDER_ID, userId: USER_ID }, attemptsMade: 2, opts: { attempts: 5 } },
      new Error('SMTP connection refused'),
    );

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, attemptsMade: 2 }),
      expect.stringContaining('will retry'),
    );
  });

  it('logs worker-level errors (a dead Redis connection never reaches a job)', () => {
    const { deps } = makeDeps();
    const connectionError = new Error('ECONNREFUSED 127.0.0.1:6379');

    startEmailWorker(deps, { host: 'localhost', port: 6379 });

    expect(errorListeners).toHaveLength(1);

    errorListeners[0](connectionError);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: connectionError }),
      expect.stringContaining('worker error'),
    );
  });
});
