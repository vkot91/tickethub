import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports up when the AMQP connection is live', async () => {
    const health = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    const amqp = { connected: true };
    const controller = new HealthController(health as never, amqp as never);

    const res = await controller.check();

    expect(res).toEqual({ status: 'ok' });
    // run the indicator the controller handed to health.check to cover the up branch
    const result = await health.check.mock.calls[0][0][0]();
    expect(result).toEqual({ rabbitmq: { status: 'up' } });
  });

  it('throws a health error when the AMQP connection is down', async () => {
    const health = { check: jest.fn().mockResolvedValue({ status: 'error' }) };
    const amqp = { connected: false };
    const controller = new HealthController(health as never, amqp as never);

    await controller.check();

    const indicator = health.check.mock.calls[0][0][0];
    expect(() => indicator()).toThrow('rabbitmq down');
  });
});
