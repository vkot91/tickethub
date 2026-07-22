import { Controller, Get } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { HealthCheck, HealthCheckService, HealthCheckError } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly amqp: AmqpConnection,
  ) {}
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => {
        if (!this.amqp.connected) {
          throw new HealthCheckError('rabbitmq down', { rabbitmq: { status: 'down' } });
        }
        return { rabbitmq: { status: 'up' } };
      },
    ]);
  }
}
