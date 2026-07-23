import { rmqRootModule } from './rmq.module';

describe('rmqRootModule', () => {
  it('registers RabbitMQ globally so AmqpConnection is injectable app-wide', () => {
    const def = rmqRootModule();

    expect(def.global).toBe(true);
    expect(def.module).toBeDefined();
  });
});
