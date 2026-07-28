import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HoldTimer } from './hold-timer';

const NOW = new Date('2026-08-14T20:00:00.000Z');

function expiresIn(seconds: number): string {
  return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

function advance(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HoldTimer', () => {
  it('ticks down once a second', () => {
    render(<HoldTimer expiresAt={expiresIn(600)} onExpire={vi.fn()} />);

    expect(screen.getByRole('timer')).toHaveTextContent('10:00');

    advance(1);
    expect(screen.getByRole('timer')).toHaveTextContent('9:59');

    advance(59);
    expect(screen.getByRole('timer')).toHaveTextContent('9:00');
  });

  it('turns red as it crosses the 90 second boundary, and not before', () => {
    render(<HoldTimer expiresAt={expiresIn(91)} onExpire={vi.fn()} />);

    expect(screen.getByRole('timer')).not.toHaveClass('text-danger');

    advance(1);
    expect(screen.getByRole('timer')).toHaveClass('text-danger');
  });

  it('calls back exactly once when the hold runs out', () => {
    const onExpire = vi.fn();

    render(<HoldTimer expiresAt={expiresIn(2)} onExpire={onExpire} />);

    expect(onExpire).not.toHaveBeenCalled();

    advance(2);
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Still zero a few ticks later — the callback must not fire again.
    advance(5);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('opens already expired when the order is stale', () => {
    const onExpire = vi.fn();

    render(<HoldTimer expiresAt={expiresIn(-30)} onExpire={onExpire} />);

    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = render(<HoldTimer expiresAt={expiresIn(600)} onExpire={vi.fn()} />);

    unmount();

    expect(() => advance(5)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
