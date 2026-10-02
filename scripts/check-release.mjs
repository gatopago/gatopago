import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const descriptor = 'release.json';
const paths = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'scripts/check-release.mjs'];
function walk(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not a reproducible Web input: ${path}`);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) {
      if (entry.name.startsWith('.env') || entry.name.startsWith('.dev.vars')) throw new Error(`Private configuration must not enter Web sources: ${path}`);
      paths.push(path);
    }
  }
}
for (const directory of ['src', 'public', 'vendor']) walk(directory);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = [...new Set(paths)].sort().map(path => {
  const bytes = readFileSync(resolve(root, path));
  return { path, sha256: hash(/\.(?:[cm]?[jt]sx?|json|css|html|svg|md|txt|ya?ml)$/.test(path) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes) };
});
const digest = hash(JSON.stringify(inputs));
const expected = { schema_version: 1, client_release_id: `web-v3-${digest}`, source_sha256: digest, input_count: inputs.length };
if (process.argv[2] === '--describe') process.stdout.write(JSON.stringify(expected, null, 2) + '\n');
else {
  if (process.argv.length !== 2) throw new Error('Use --describe; no files are written.');
  const actual = JSON.parse(readFileSync(resolve(root, descriptor), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Web source differs from release.json. Review local inputs and update its descriptor with --describe.');
  console.log(`Web release verified: ${expected.client_release_id}. Build provenance only, NOT wallet authorization or deployment attestation.`);
}
