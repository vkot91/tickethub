import '@testing-library/jest-dom/vitest';

// jsdom implements neither the Pointer Capture API nor scrollIntoView, and Radix Select's
// trigger calls both. Without these, opening a Select in a test throws rather than failing an
// assertion. Guarded because other specs may run in the node environment, where there is no
// `Element` at all. Nothing here changes behaviour in a browser.
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
