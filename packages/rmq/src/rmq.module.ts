import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { requireEnv } from '@tickethub/env';
import { RequestIdSerializer } from './request-id.serializer';

@Module({})
export class RmqModule {
  static register(name: string, queue: string): DynamicModule {
    return {
      module: RmqModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name,
            useFactory: () => ({
              transport: Transport.RMQ,
              options: {
                urls: [requireEnv('RABBITMQ_URL')],
                queue,
                queueOptions: { durable: true },
                // stamp the current request id onto every outgoing message
                serializer: new RequestIdSerializer(),
              },
            }),
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
