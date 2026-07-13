import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { isNull, eq } from 'drizzle-orm';
import type { Db, OutboxTable } from '@tickethub/db';

// ponytail: interval poll + FOR UPDATE SKIP LOCKED. At-least-once (emit may repeat on
// crash between emit and commit) — consumers dedupe via processed_messages. CDC only if
// throughput ever demands it.
@Injectable()
export class OutboxPoller implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxPoller.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly table: OutboxTable,
    private readonly client: ClientProxy,
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

  async drain(): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(this.table)
        .where(isNull(this.table.publishedAt))
        .for('update', { skipLocked: true })
        .limit(this.batch);

      for (const row of rows) {
        await firstValueFrom(this.client.emit(row.routingKey, row.payload));
        await tx
          .update(this.table)
          .set({ publishedAt: new Date() })
          .where(eq(this.table.id, row.id));
      }
    });
  }
}
