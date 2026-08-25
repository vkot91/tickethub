import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Fans a room broadcast across every gateway replica over Redis pub/sub.
 *
 * Not optional. Each of the three seat-map queues is durable, so RabbitMQ delivers a message to
 * exactly one replica; without this adapter the replica that consumed it broadcasts to its own
 * sockets and every browser attached to another replica sees nothing. That failure is
 * load-dependent, silent, and invisible with a single replica in development.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(redisUrl: string): Promise<void> {
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);

    if (this.adapterConstructor) server.adapter(this.adapterConstructor);

    return server;
  }
}
