'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

import { seatMapKeys } from './api';

/**
 * Keeps one show's seat map fresh. The socket carries a bare `{ showId }` and never seat state:
 * the cached map is refetched from the endpoint that stitched it, so a missed message costs
 * freshness rather than correctness.
 *
 * Same-origin — Traefik routes `/ws` on this host to the gateway — so `io()` needs no URL and no
 * credentials. Returns whether the socket is up, which is what drives the polling fallback.
 */
export function useSeatMapSocket(showId: string): boolean {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io({ path: '/ws', transports: ['websocket'] });

    // Re-emitted on every `connect`, not once on mount: after a reconnect the server has no
    // memory of this client's rooms, so a subscribe sent only at startup would leave a socket
    // that looks healthy and receives nothing.
    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe', { showId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('seat-map:changed', () => {
      queryClient.invalidateQueries({ queryKey: seatMapKeys.byShow(showId) });
    });

    return () => {
      socket.disconnect();
    };
  }, [showId, queryClient]);

  return isConnected;
}
