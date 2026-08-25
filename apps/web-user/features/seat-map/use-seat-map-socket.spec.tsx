import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seatMapKeys } from './api';
import { useSeatMapSocket } from './use-seat-map-socket';

const handlers = new Map<string, (payload?: unknown) => void>();
const socket = {
  on: vi.fn((name: string, handler: (payload?: unknown) => void) => handlers.set(name, handler)),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({ io: () => socket }));

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return QueryWrapper;
}

describe('useSeatMapSocket', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it('subscribes to the show room once connected', () => {
    renderHook(() => useSeatMapSocket('e1'), { wrapper: wrapper(new QueryClient()) });
    act(() => handlers.get('connect')?.());

    expect(socket.emit).toHaveBeenCalledWith('subscribe', { showId: 'e1' });
  });

  it('invalidates the seat map when the server says the show changed', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useSeatMapSocket('e1'), { wrapper: wrapper(queryClient) });
    act(() => handlers.get('seat-map:changed')?.({ showId: 'e1' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: seatMapKeys.byShow('e1') });
  });

  it('reports connection state so the caller can fall back to polling', () => {
    const { result } = renderHook(() => useSeatMapSocket('e1'), {
      wrapper: wrapper(new QueryClient()),
    });

    expect(result.current).toBe(false);

    act(() => handlers.get('connect')?.());
    expect(result.current).toBe(true);

    act(() => handlers.get('disconnect')?.());
    expect(result.current).toBe(false);
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useSeatMapSocket('e1'), {
      wrapper: wrapper(new QueryClient()),
    });

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });
});
