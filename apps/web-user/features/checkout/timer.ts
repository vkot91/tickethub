/** The hold window the orders service grants. Used only to draw the progress bar — the
 *  countdown itself always comes from the order's own `expiresAt`. */
export const HOLD_WINDOW_MS = 10 * 60 * 1000;

/** Below this the design turns the timer and its bar red. */
export const URGENT_MS = 90 * 1000;

export function msLeft(expiresAt: string, now: number): number {
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Percentage of the hold window still left, clamped so a long-lived order cannot
 *  overfill the bar and an expired one cannot go negative. */
export function progressPercent(remainingMs: number, windowMs = HOLD_WINDOW_MS): number {
  return Math.min(100, Math.max(0, (remainingMs / windowMs) * 100));
}

export function isUrgent(remainingMs: number): boolean {
  return remainingMs > 0 && remainingMs <= URGENT_MS;
}
