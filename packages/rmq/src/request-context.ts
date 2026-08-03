import { AsyncLocalStorage } from 'node:async_hooks';

import { v4 as uuid } from 'uuid';

export const requestIdStore = new AsyncLocalStorage<{ requestId: string }>();

export function getRequestId(): string {
  return requestIdStore.getStore()?.requestId ?? uuid();
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStore.run({ requestId }, fn);
}
