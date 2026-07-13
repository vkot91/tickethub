import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('pings RabbitMQ using the configured url', async () => {
    const health = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    const mq = { pingCheck: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('amqp://localhost') };
    const controller = new HealthController(health as never, mq as never, config as never);

    const res = await controller.check();

    expect(res).toEqual({ status: 'ok' });
    expect(config.get).toHaveBeenCalledWith('RABBITMQ_URL', { infer: true });
    // run the indicator the controller handed to health.check to cover the ping closure
    await health.check.mock.calls[0][0][0]();
    expect(mq.pingCheck).toHaveBeenCalled();
  });
});
