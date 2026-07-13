import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv, requireEnv } from './index';

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.__TEST_REQ = 'yes';
    expect(requireEnv('__TEST_REQ')).toBe('yes');
    delete process.env.__TEST_REQ;
  });

  it('throws when unset', () => {
    delete process.env.__TEST_MISSING;
    expect(() => requireEnv('__TEST_MISSING')).toThrow(/__TEST_MISSING/);
  });
});

describe('loadEnv', () => {
  // Spy on the native loader: jest swaps process.env for a copy, so loadEnvFile's
  // real mutation isn't observable here — but the walk-up (the actual logic) is.
  it('walks up parent dirs to the nearest .env', () => {
    const root = mkdtempSync(join(tmpdir(), 'env-'));
    const nested = join(root, 'apps', 'svc');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, '.env'), '__TEST_LOADED=42\n');

    const spy = jest.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    loadEnv(nested);
    expect(spy).toHaveBeenCalledWith(join(root, '.env'));

    spy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('is a no-op when no .env exists up the tree', () => {
    const empty = mkdtempSync(join(tmpdir(), 'noenv-'));
    const spy = jest.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    expect(() => loadEnv(empty)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    rmSync(empty, { recursive: true, force: true });
  });
});
