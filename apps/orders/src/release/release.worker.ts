import { Worker } from 'bullmq';
import type { OrderSagaService } from '../saga/saga.service';

// Consumes the delayed 'release' jobs and expires still-unpaid orders (no-op if already paid).
export function startReleaseWorker(
  sagaService: OrderSagaService,
  connection: { host: string; port: number },
): Worker {
  return new Worker(
    'orders.release',
    async (job) => {
      await sagaService.release(job.data.orderId);
    },
    { connection },
  );
}
