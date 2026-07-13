import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport, type RmqOptions } from '@nestjs/microservices';
import { requireEnv } from '@tickethub/env';
import { RequestIdSerializer } from './request-id.serializer';

// Canonical RMQ client/queue options. Every declaration of a given queue (server and
// its remote clients) must pass identical queueOptions or RabbitMQ rejects the second
// with PRECONDITION_FAILED — so both sides build options here. The dead-letter exchange
// (`${queue}.dlx`) sends nacked/poison messages aside instead of redelivering forever.
export function rmqClientOptions(queue: string, url: string): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue,
      queueOptions: { durable: true, deadLetterExchange: `${queue}.dlx` },
      // stamp the current request id onto every outgoing message
      serializer: new RequestIdSerializer(),
    },
  };
}

@Module({})
export class RmqModule {
  static register(name: string, queue: string): DynamicModule {
    return {
      module: RmqModule,
      imports: [
        ClientsModule.registerAsync([
          { name, useFactory: () => rmqClientOptions(queue, requireEnv('RABBITMQ_URL')) },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
