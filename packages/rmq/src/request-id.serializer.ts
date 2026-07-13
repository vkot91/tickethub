import { RmqRecord, type Serializer } from '@nestjs/microservices';
import { getRequestId } from './request-context';

// Stamp the current request id onto every outgoing RMQ message. Nest's ClientRMQ
// pulls `options` off the serialized packet and merges `options.headers` into the
// AMQP publish headers, where the consumer's RequestIdInterceptor reads it back.
// Mirrors the default RmqRecordSerializer (unwrap an RmqRecord's data/options),
// then adds our header — so hand-built RmqRecords keep working.
export class RequestIdSerializer implements Serializer {
  serialize(packet: { data?: unknown; options?: { headers?: Record<string, unknown> } }) {
    const base =
      packet.data instanceof RmqRecord
        ? { ...packet, data: packet.data.data, options: packet.data.options }
        : packet;

    return {
      ...base,
      options: {
        ...base.options,
        headers: { ...base.options?.headers, 'x-request-id': getRequestId() },
      },
    };
  }
}
