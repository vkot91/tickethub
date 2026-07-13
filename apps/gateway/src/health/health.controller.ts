import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import { HealthCheck, HealthCheckService, MicroserviceHealthIndicator } from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';
import type { Config } from '../config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mq: MicroserviceHealthIndicator,
    private readonly config: ConfigService<Config, true>,
  ) {}
  @Get()
  @HealthCheck()
  check() {
    const urls = [this.config.get('RABBITMQ_URL', { infer: true })];
    return this.health.check([
      () => this.mq.pingCheck('rabbitmq', { transport: Transport.RMQ, options: { urls } }),
    ]);
  }
}
