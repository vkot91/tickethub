import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { SEAT_MAP_EVENT, SEAT_MAP_ROOM } from './seat-map.broadcaster';

const subscribeSchema = z.object({ showId: z.string().uuid() });

/**
 * The buyer seat map's push channel. Deliberately unauthenticated: every byte it carries is the
 * same public availability the unguarded `GET /shows/:id/seat-map` already returns, and the
 * session cookie that now reaches this process (same-origin, via Traefik) is ignored on purpose.
 * A per-user stream is a different stream and gets its own ticket handshake.
 *
 * Not under `user/` — this file is reached by a browser with no session, and the events that
 * drive it have no audience at all.
 */
@WebSocketGateway({ path: '/ws', transports: ['websocket'] })
export class SeatMapGateway {
  @WebSocketServer() server!: Server;

  @SubscribeMessage('subscribe')
  subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): void {
    const parsed = subscribeSchema.safeParse(body);

    // A malformed id would otherwise open a room nothing ever broadcasts to — a quiet leak of
    // one room per bad client rather than an error anyone would notice.
    if (!parsed.success) return;

    client.join(SEAT_MAP_ROOM(parsed.data.showId));
  }

  @SubscribeMessage('unsubscribe')
  unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): void {
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) return;

    client.leave(SEAT_MAP_ROOM(parsed.data.showId));
  }

  broadcast(showId: string): void {
    this.server.to(SEAT_MAP_ROOM(showId)).emit(SEAT_MAP_EVENT, { showId });
  }
}
