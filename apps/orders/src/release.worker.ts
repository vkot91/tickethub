import { Worker } from 'bullmq';
import type { OrdersService } from './orders.service';

// Consumes the delayed 'release' jobs and expires still-unpaid orders (no-op if already paid).
export function startReleaseWorker(
  service: OrdersService,
  connection: { host: string; port: number },
): Worker {
  return new Worker(
    'orders.release',
    async (job) => {
      await service.release(job.data.orderId);
    },
    { connection },
  );
}
