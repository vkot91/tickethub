import { startReleaseWorker } from './release.worker';

// Capture the processor BullMQ would run, without a real Redis connection.
const processors: Array<(job: { data: { orderId: string } }) => Promise<void>> = [];
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_queue, processor) => {
    processors.push(processor);
    return { name: _queue };
  }),
}));

describe('startReleaseWorker', () => {
  it('delegates a release job to the service', async () => {
    const svc = { release: jest.fn().mockResolvedValue(undefined) };
    startReleaseWorker(svc as never, { host: 'localhost', port: 6379 });

    await processors[0]({ data: { orderId: 'ord1' } });

    expect(svc.release).toHaveBeenCalledWith('ord1');
  });
});
