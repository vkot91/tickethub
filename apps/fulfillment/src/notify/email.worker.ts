import { Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type { StorageClient } from '@tickethub/storage';
import type { Mailer } from '@tickethub/mailer';
import { rpcRequest } from '@tickethub/rmq';
import { AUTH_MESSAGE_PATTERNS, type GetUserResponse } from '@tickethub/contracts';
import { renderTicketEmail } from './email.template';

export interface EmailDeps {
  amqp: AmqpConnection;
  storage: StorageClient;
  mailer: Mailer;
}

export interface SendTicketEmailJob {
  orderId: string;
  userId: string;
}

// The job handler as a plain function: unit-testable without spinning up BullMQ. Failures
// (RPC, S3, SMTP) propagate deliberately — no try/catch — so BullMQ's retry/backoff kicks in
// instead of the customer's ticket silently vanishing.
export async function sendTicketEmail(deps: EmailDeps, data: SendTicketEmailJob): Promise<void> {
  const user = await rpcRequest<GetUserResponse>(deps.amqp, AUTH_MESSAGE_PATTERNS.GET_USER, {
    userId: data.userId,
  });

  const pdf = await deps.storage.get(`${data.orderId}.pdf`);

  await deps.mailer.send({
    to: user.email,
    subject: 'Your TicketHub ticket',
    html: renderTicketEmail({ orderId: data.orderId }),
    attachments: [
      { filename: `ticket-${data.orderId}.pdf`, content: pdf, contentType: 'application/pdf' },
    ],
  });
}

// Consumes the 'send-ticket-email' jobs enqueued by NotifyController.
export function startEmailWorker(
  deps: EmailDeps,
  connection: { host: string; port: number },
): Worker {
  const log = new Logger('EmailWorker');

  const worker = new Worker<SendTicketEmailJob>(
    'send-ticket-email',
    (job) => sendTicketEmail(deps, job.data),
    { connection },
  );

  // Without these, a job that burns through all 5 attempts leaves no trace outside Redis — the
  // buyer's ticket email just never arrives and nothing anywhere says why.
  worker.on('failed', (job, error) => {
    const exhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);

    log.error(
      { orderId: job?.data.orderId, attemptsMade: job?.attemptsMade, err: error },
      exhausted
        ? `send-ticket-email gave up for order ${job?.data.orderId}`
        : `send-ticket-email attempt failed for order ${job?.data.orderId}, will retry`,
    );
  });

  worker.on('error', (error) => log.error({ err: error }, 'send-ticket-email worker error'));

  return worker;
}
