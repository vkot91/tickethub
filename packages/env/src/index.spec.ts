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
  const dirs: string[] = [];
  const keys = ['__TEST_LOADED', '__TEST_COMMENT', '__TEST_QUOTED', '__TEST_PRESET'];

  function envDir(contents: string): string {
    const root = mkdtempSync(join(tmpdir(), 'env-'));
    dirs.push(root);
    writeFileSync(join(root, '.env'), contents);
    return root;
  }

  afterEach(() => {
    for (const key of keys) delete process.env[key];
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('walks up parent dirs to the nearest .env and assigns into process.env', () => {
    const root = envDir('__TEST_LOADED=42\n');
    const nested = join(root, 'apps', 'svc');
    mkdirSync(nested, { recursive: true });

    loadEnv(nested);

    expect(process.env.__TEST_LOADED).toBe('42');
  });

  it('skips comments and blank lines, and strips surrounding quotes', () => {
    const root = envDir('\n# a comment\n__TEST_COMMENT=ok\n__TEST_QUOTED="quoted value"\n');

    loadEnv(root);

    expect(process.env.__TEST_COMMENT).toBe('ok');
    expect(process.env.__TEST_QUOTED).toBe('quoted value');
  });

  it('does not overwrite vars already set — the real environment wins', () => {
    process.env.__TEST_PRESET = 'from-shell';
    const root = envDir('__TEST_PRESET=from-file\n');

    loadEnv(root);

    expect(process.env.__TEST_PRESET).toBe('from-shell');
  });

  it('is a no-op when no .env exists up the tree', () => {
    const empty = mkdtempSync(join(tmpdir(), 'noenv-'));
    dirs.push(empty);

    expect(() => loadEnv(empty)).not.toThrow();
  });
});
