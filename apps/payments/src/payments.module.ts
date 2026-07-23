import { Module } from '@nestjs/common';
import { paymentsOutbox, paymentsProcessedMessages } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { rmqRootModule, OutboxModule } from '@tickethub/rmq';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { WebhookController } from './webhook/webhook.controller';
import { WebhookService } from './webhook/webhook.service';
import { PaymentsSagaController } from './saga/saga.controller';
import { PaymentsSagaService } from './saga/saga.service';
import { StripeClient } from './stripe.client';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;
const get = <K extends keyof Config>(c: Cfg, k: K) => c.get(k, { infer: true });

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    DbModule.forRoot(),
    OutboxModule.forFeature({ outbox: paymentsOutbox, processed: paymentsProcessedMessages }),
    rmqRootModule(),
  ],
  controllers: [PaymentsController, WebhookController, PaymentsSagaController],
  providers: [
    {
      provide: StripeClient,
      inject: [ConfigService],
      useFactory: (c: Cfg) =>
        StripeClient.fromSecret(get(c, 'STRIPE_SECRET_KEY'), get(c, 'STRIPE_WEBHOOK_SECRET')),
    },
    PaymentsService,
    WebhookService,
    PaymentsSagaService,
  ],
})
export class PaymentsModule {}
