import { Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE } from '@tickethub/contracts';

// Each event handler binds its own queue + DLX to the topic exchange, so a new subscriber
// (e.g. Notifications) can bind the same routing key without stealing another service's messages.
export const eventSub = (routingKey: string, queue: string) => ({
  exchange: EVENTS_EXCHANGE,
  routingKey,
  queue,
  queueOptions: { deadLetterExchange: `${queue}.dlx` },
});

// A failed handler dead-letters (no requeue) rather than looping forever; consumers are
// idempotent (processed_messages) so at-least-once redelivery on the happy path is safe.
export async function nackOnError(handler: () => Promise<unknown>): Promise<Nack | undefined> {
  try {
    await handler();
  } catch {
    return new Nack(false);
  }
}
