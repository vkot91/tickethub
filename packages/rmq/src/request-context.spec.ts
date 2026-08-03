import { getRequestId, runWithRequestId } from './request-context';

describe('request id ALS', () => {
  it('exposes the id inside the context', () => {
    runWithRequestId('abc', () => {
      expect(getRequestId()).toBe('abc');
    });
  });
  it('generates an id when outside a context', () => {
    expect(getRequestId()).toMatch(/[0-9a-f-]{36}/);
  });
});
