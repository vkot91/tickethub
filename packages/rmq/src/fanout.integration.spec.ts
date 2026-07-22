import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import * as amqplib from 'amqplib';
import { v4 as uuid } from 'uuid';
import { EVENTS_EXCHANGE } from '@tickethub/contracts';
import { rmqConfig, publishEvent } from './rmq.config';
import { runWithRequestId } from './request-context';

jest.setTimeout(120_000);

// Proves the golevelup topic-exchange topology gives real fan-out: two independent queues
// bound to the same routing key BOTH receive a published event (not competing consumers),
// and the request-id header survives end to end.
describe('events fan-out (integration: real RabbitMQ)', () => {
  let container: StartedRabbitMQContainer;
  let url: string;
  let publisher: AmqpConnection;
  let raw: amqplib.ChannelModel;

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3.13-management').start();
    url = container.getAmqpUrl();

    // Publisher declares tickethub.events (topic) via rmqConfig.
    publisher = new AmqpConnection(rmqConfig(url));
    await publisher.init();

    raw = await amqplib.connect(url);
  });

  afterAll(async () => {
    await raw?.close();
    await publisher?.managedConnection?.close();
    await container?.stop();
  });

  // Bind a fresh queue to payment.succeeded and resolve with the first message it receives.
  async function awaitOn(queue: string): Promise<amqplib.ConsumeMessage> {
    const ch = await raw.createChannel();
    await ch.assertQueue(queue, { durable: true });
    await ch.bindQueue(queue, EVENTS_EXCHANGE, 'payment.succeeded');
    return new Promise((resolve) => {
      void ch.consume(queue, (msg) => {
        if (msg) {
          ch.ack(msg);
          resolve(msg);
        }
      });
    });
  }

  it('delivers one published event to two independent queues with the request id intact', async () => {
    // Imitate a future Notifications service binding its own queue alongside Orders'.
    const ordersMsg = awaitOn('orders.payment-succeeded');
    const notificationsMsg = awaitOn('notifications.payment-succeeded');
    // give the bindings a moment to register before publishing
    await new Promise((r) => setTimeout(r, 500));

    const payload = {
      messageId: uuid(),
      orderId: uuid(),
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    };
    await runWithRequestId('req-fanout', () =>
      publishEvent(publisher, 'payment.succeeded', payload),
    );

    const [orders, notifications] = await Promise.all([ordersMsg, notificationsMsg]);

    for (const msg of [orders, notifications]) {
      expect(JSON.parse(msg.content.toString())).toEqual(payload);
      expect(msg.properties.headers?.['x-request-id']).toBe('req-fanout');
    }
  });
});
