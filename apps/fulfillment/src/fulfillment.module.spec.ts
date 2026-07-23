import { Test } from '@nestjs/testing';
import { AmqpConnection, AmqpConnectionManager } from '@golevelup/nestjs-rabbitmq';
import { OutboxPoller, OutboxRepository, InboxRepository } from '@tickethub/outbox';
import { TicketsService } from './tickets/tickets.service';
import { TicketsController } from './tickets/tickets.controller';
import { NotifyController } from './notify/notify.controller';
import { S3Client } from './storage/s3.client';

// The schema demands at least 32 chars; this is an obvious placeholder, not a real key.
const QR_SECRET = 'test-qr-secret-not-a-real-key-0123456789';

// configModuleFor validates env eagerly at import, so set placeholders before requiring the module.
// NODE_ENV=production keeps AppLoggerModule off the pino-pretty transport, which would otherwise
// spawn a worker thread and leave an open handle behind.
function setPlaceholderEnv(): void {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/test';
  process.env.RABBITMQ_URL = 'amqp://localhost';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_ACCESS_KEY = 'access';
  process.env.S3_SECRET_KEY = 'secret';
  process.env.S3_BUCKET_TICKETS = 'tickets';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.MAIL_FROM = 'tickets@tickethub.test';
  process.env.TICKET_QR_SECRET = QR_SECRET;
}

// Everything that would open a socket at instantiation is replaced: RabbitMQ (the connection
// manager factory dials the broker) and the two BullMQ objects (each opens its own Redis
// connection). The rest of the graph is built for real, which is the point of this spec.
async function compileModule() {
  setPlaceholderEnv();

  const { FulfillmentModule } =
    require('./fulfillment.module') as typeof import('./fulfillment.module');

  // RabbitMQModule's shutdown hook drains the manager, so the stub honours that much of its API.
  const connectionManagerStub = {
    close: () => Promise.resolve(),
    clearConnections: () => undefined,
    getConnections: () => [],
  };

  return Test.createTestingModule({ imports: [FulfillmentModule] })
    .overrideProvider(AmqpConnectionManager)
    .useValue(connectionManagerStub as never)
    .overrideProvider(AmqpConnection)
    .useValue({} as never)
    .overrideProvider('EMAIL_QUEUE')
    .useValue({} as never)
    .overrideProvider('EMAIL_WORKER')
    .useValue({} as never)
    .compile();
}

describe('FulfillmentModule', () => {
  it('resolves TicketsService with the QR secret from config', async () => {
    const moduleRef = await compileModule();

    const ticketsService = moduleRef.get(TicketsService);

    expect(ticketsService).toBeInstanceOf(TicketsService);
    expect((ticketsService as unknown as { qrSecret: string }).qrSecret).toBe(QR_SECRET);

    await moduleRef.close();
  });

  it('resolves both RMQ controllers', async () => {
    const moduleRef = await compileModule();

    expect(moduleRef.get(TicketsController)).toBeInstanceOf(TicketsController);
    expect(moduleRef.get(NotifyController)).toBeInstanceOf(NotifyController);

    await moduleRef.close();
  });

  it('resolves the persistence and delivery providers', async () => {
    const moduleRef = await compileModule();

    expect(moduleRef.get('DB')).toBeDefined();
    expect(moduleRef.get(S3Client)).toBeInstanceOf(S3Client);
    expect(moduleRef.get(OutboxRepository)).toBeInstanceOf(OutboxRepository);
    expect(moduleRef.get(InboxRepository)).toBeInstanceOf(InboxRepository);
    expect(moduleRef.get(OutboxPoller)).toBeInstanceOf(OutboxPoller);
    expect(moduleRef.get('MAILER')).toBeDefined();

    await moduleRef.close();
  });
});
