import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let directory: string;
const script = readFileSync(fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url)), 'utf8');
function fixtureFile(path: string, value: string | Buffer) {
  const destination = join(directory, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, value);
}
function describeRelease() {
  return JSON.parse(execFileSync(process.execPath, [join(directory, 'scripts/check-release.mjs'), '--describe'], { encoding: 'utf8' })) as {
    schema_version: number; client_release_id: string; source_sha256: string; input_count: number;
  };
}
const check = () => execFileSync(process.execPath, [join(directory, 'scripts/check-release.mjs')], { encoding: 'utf8', stdio: 'pipe' });
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gatopago-v3-release-'));
  fixtureFile('scripts/check-release.mjs', script);
  for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'src/page.tsx',
    'public/icon.png', 'vendor/brand.json', 'vendor/environment.json', 'vendor/primitives.ts']) {
    fixtureFile(path, 'fixture\n');
  }
  fixtureFile('release.json', JSON.stringify(describeRelease()));
});
afterEach(() => {
  // Delete only this test's freshly created, direct child of the OS temporary directory.
  const child = relative(tmpdir(), directory);
  if (!child.startsWith('gatopago-v3-release-') || child.includes(sep)) throw new Error('Unsafe test cleanup target');
  rmSync(directory, { recursive: true, force: true });
});
describe('Web release source guard (synthetic filesystem, no project mutations)', () => {
  it('accepts exactly the described sources and refuses a hand-written release identifier', () => {
    const descriptor = describeRelease();
    expect(descriptor.client_release_id).toMatch(/^web-v3-[0-9a-f]{64}$/);
    expect(check()).toContain(descriptor.client_release_id);
    fixtureFile('release.json', JSON.stringify({ ...descriptor, client_release_id: 'trusted-by-name' }));
    expect(check).toThrow('differs');
  });
  it.each(['src/page.tsx', 'pnpm-lock.yaml', 'vendor/new-capability.ts'])('rejects changed or newly added input %s', (path) => {
    const original = describeRelease();
    fixtureFile(path, 'changed\n');
    expect(describeRelease().source_sha256).not.toBe(original.source_sha256);
    expect(check).toThrow('differs');
  });
  it('normalizes CRLF text but not binary asset bytes', () => {
    const original = describeRelease();
    fixtureFile('src/page.tsx', 'fixture\r\n');
    expect(describeRelease()).toEqual(original);
    expect(check()).toContain('verified');
    fixtureFile('public/icon.png', Buffer.from('fixture\r\n'));
    expect(describeRelease().source_sha256).not.toBe(original.source_sha256);
    expect(check).toThrow('differs');
  });
  it('ignores test/build tooling artifacts but not the fingerprint generator', () => {
    const original = describeRelease();
    fixtureFile('test/fixture.ts', 'ignored');
    fixtureFile('vendor/node_modules/fixture/index.js', 'ignored');
    expect(describeRelease()).toEqual(original);
    fixtureFile('scripts/check-release.mjs', script + '\n// changed generator\n');
    expect(check).toThrow('differs');
  });
  it('rejects private environment filenames instead of hashing possible secrets', () => {
    fixtureFile('public/.env.local', 'synthetic-only');
    expect(check).toThrow('Private configuration');
  });
});
