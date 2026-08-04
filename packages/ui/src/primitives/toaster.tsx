'use client';

import { useSyncExternalStore } from 'react';

import { Toast, ToastProvider, ToastViewport, type ToastProps } from './toast';

/** The design's toast tones. `danger` is the error one — the token name the rest of the UI uses. */
export type ToastTone = NonNullable<ToastProps['tone']>;

export type ToastOptions = Pick<ToastProps, 'title' | 'body' | 'duration' | 'action'>;

interface ToastItem extends ToastOptions {
  id: string;
  tone: ToastTone;
}

// A module singleton rather than React context: a toast is fired from mutation callbacks and
// `catch` blocks, which are not render contexts, and `@tickethub/ui` is a package boundary a
// provider would have to cross. Radix's Provider still wraps the viewport for focus and swipe.
let toasts: readonly ToastItem[] = [];
let nextId = 0;

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((notify) => notify());

/**
 * The app's toasts — a collection, fired from anywhere: no provider, no hook, no local state.
 *
 *     toast.add('success', { title: 'Draft created' });
 *     toast.add('danger', { title: 'Could not hold those seats', body: error.message });
 *
 * Tone is its own argument rather than an option so it cannot be forgotten, and so a call
 * reads as the thing that happened. Radix auto-closes on `duration` without a `remove` call.
 */
export const toast = {
  /** Queues a toast. Returns its id, for removing it before its duration is up. */
  add(tone: ToastTone, options: ToastOptions): string {
    const id = String(++nextId);

    toasts = [...toasts, { ...options, tone, id }];

    emit();

    return id;
  },

  /** Removes one toast, or every toast when called with no id. */
  remove(id?: string): void {
    toasts = id === undefined ? [] : toasts.filter((item) => item.id !== id);

    emit();
  },
};

const subscribe = (notify: () => void) => {
  listeners.add(notify);

  return () => void listeners.delete(notify);
};

// Stable references: `useSyncExternalStore` re-renders forever if either returns a fresh array.
const getSnapshot = () => toasts;
const EMPTY: readonly ToastItem[] = [];
const getServerSnapshot = () => EMPTY;

/** Mount once, in the root layout. Everything else calls `toast.add`. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <ToastProvider swipeDirection="right">
      {items.map(({ id, ...options }) => (
        <Toast key={id} open onOpenChange={(open) => !open && toast.remove(id)} {...options} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
