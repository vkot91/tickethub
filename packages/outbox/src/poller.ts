import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { OutboxRepository } from './outbox.repository';

// Publishes one outbox row to the broker. Injected so the poller stays transport-agnostic —
// it depends on neither @nestjs/microservices nor golevelup, and is testable without a broker.
export type PublishFn = (routingKey: string, payload: unknown) => Promise<void>;

// ponytail: interval poll + FOR UPDATE SKIP LOCKED. At-least-once (publish may repeat on
// crash between publish and commit) — consumers dedupe via InboxRepository. CDC only if
// throughput ever demands it.
@Injectable()
export class OutboxPoller implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxPoller.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publish: PublishFn,
    private readonly intervalMs = 500,
    private readonly batch = 100,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.drain().catch((e) => this.log.error(e)),
      this.intervalMs,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Publish-then-mark: a failure here leaves the row unpublished, so it goes out again.
  // Marking first would turn at-least-once into at-most-once and silently drop events.
  async drain(): Promise<void> {
    await this.outbox.withTransaction(async (tx) => {
      const rows = await this.outbox.fetchUnpublished(tx, this.batch);

      for (const row of rows) {
        await this.publish(row.routingKey, row.payload);

        await this.outbox.markPublished(tx, row.id);
      }
    });
  }
}
