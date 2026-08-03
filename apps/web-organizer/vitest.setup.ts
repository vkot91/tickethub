import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

import { toast } from '@tickethub/ui';

// The toast store is a module singleton, so it outlives a test's unmount. Clear it between
// tests or a toast one spec fired shows up in the next one's queries.
afterEach(() => toast.remove());

// jsdom implements neither the Pointer Capture API nor scrollIntoView, and Radix Select's
// trigger calls both. Without these, opening a Select in a test throws rather than failing an
// assertion. Guarded because the server-action specs run in the node environment, where there
// is no `Element` at all. Nothing here changes behaviour in a browser.
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
