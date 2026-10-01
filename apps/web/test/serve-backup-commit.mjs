// Local browser harness, not a deployed app or a real passkey/finality proof.
// Public synthetic inputs only; actual React panel and strict wire parsers.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFile = resolve(webRoot, 'output/playwright/v3-commit-fixture.mjs');
await build({ outfile: fixtureFile, bundle: true, platform: 'node', format: 'esm', stdin: { resolveDir: webRoot,
  contents: "export { backupWireFixture } from './test/backup.fixture';" } });
const { backupWireFixture } = await import(pathToFileURL(fixtureFile).href);
const f = backupWireFixture();
const data = { context: { choice: f.choice, parent: f.parent }, pin: f.f.pin, observation: f.f.pending() };
const css = await readFile(resolve(webRoot, 'src/app/base.css'), 'utf8') + await readFile(resolve(webRoot, 'src/auth/auth.css'), 'utf8');
const result = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'cancelled-ceremony-only', setup(builder) {
    builder.onResolve({ filter: /^\.\/passkeys$/ }, () => ({ path: 'cancelled-proof', namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `export async function requestPasskeyProof() {
      window.syntheticCommitCeremony(); throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); }`, loader: 'js' }));
  } }], define: { 'process.env.NODE_ENV': '"development"' },
  stdin: { resolveDir: webRoot, sourcefile: 'commit-harness.tsx', loader: 'tsx', contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BackupCommitPanel from './src/wallet/BackupCommitPanel';
import { prepareBackupCommit } from '@gatopago/shared/v3/backup-enrollment';
import { parseBackupCommitPreview } from '@gatopago/shared/v3/backup-wire';
import { parseBackupStatus } from '@gatopago/shared/v3/backup-status';
const data = ${JSON.stringify(data)};
const counters = { preparations: 0, reads: 0, status: 0, ceremonies: 0, submissions: 0 };
let current = {}, wire = null, delay = false, failure = false, progressMode = 'pending';
const listeners = new Set();
function count(key) { counters[key]++; document.getElementById(key).textContent = String(counters[key]); }
window.syntheticCommitCeremony = () => count('ceremonies');
Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
  get() { throw new Error('Unexpected real ceremony'); }, create() { throw new Error('Unexpected real ceremony'); }
} });
const runtime = {
  subscribe(callback) { listeners.add(callback); callback({ uid: 'synthetic' }); return () => listeners.delete(callback); },
  async backup(uid) {
    const captured = current;
    const assertCurrent = () => { if (captured !== current || uid !== 'synthetic') throw { code: 'auth/session-changed' }; };
    const wait = async (signal) => {
      if (delay) await new Promise(resolve => setTimeout(resolve, 5000));
      signal.throwIfAborted(); assertCurrent(); if (failure) throw { code: 'backup/unavailable' };
    };
    return { assertCurrent,
      async prepareCommit(choice, parent, id, signal) {
        count('preparations'); assertCurrent();
        if (!wire) {
          const now = Math.floor(Date.now() / 1000), input = parent.wire.input;
          const compiled = prepareBackupCommit(input, data.observation, now, now + 300, now);
          wire = { commit_id: id, backup_id: choice.backupId, proposal_hash: compiled.prepared.digest,
            commit_digest: compiled.digest, valid_after: now, valid_until: now + 300, state: 'prepared',
            backup_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false, input, observation: data.observation };
        }
        await wait(signal);
        return { wire: structuredClone(wire), preview: parseBackupCommitPreview(wire, choice, parent.wire, id) };
      },
      async restoreCommit(choice, parent, id, signal) {
        count('reads'); await wait(signal); if (!wire || wire.commit_id !== id) throw { code: 'backup/not-found' };
        return { wire: structuredClone(wire), preview: parseBackupCommitPreview(wire, choice, parent.wire, id) };
      },
      async authorizeCommit() { count('submissions'); throw new Error('This harness never submits authorization'); },
      async status(choice, parent, id, signal) {
        count('status'); await wait(signal); const now = Math.floor(Date.now() / 1000);
        const observed = progressMode !== 'pending', history = ['confirmed','stale'].includes(progressMode);
        const observation = observed ? { epoch: progressMode === 'stale' ? 2 : 1, observed_at: progressMode === 'stale' ? now - 2 : now - 12,
          status: progressMode === 'stale' ? 'unavailable' : 'observed', finality: progressMode === 'stale' ? 'not_assessed' : 'finalized',
          outcome: progressMode === 'stale' ? null : 'backup_committed', block_number: progressMode === 'stale' ? null : '102',
          block_hash: progressMode === 'stale' ? null : '0x' + 'b'.repeat(64), evidence_expires_at: progressMode === 'stale' ? null : now + 28 } : null;
        return parseBackupStatus({ schema_version: 1, backup_id: choice.backupId, operation_id: id, kind: 'commit',
          proposal_hash: parent.wire.proposal_hash, consent_state: 'authorized', delivery_state: 'uncertain',
          transaction_hash: '0x' + 'a'.repeat(64), job_state: progressMode === 'review' ? 'review' : history ? 'observed' : 'ready',
          reason: progressMode === 'review' ? 'observation_timeout' : history ? 'commit_finalized' : null,
          observation, policy_confirmation: history ? { manifest_hash: parent.wire.expected_manifest_hash, recorded_at: now - 10,
            evidence_expires_at: now - 1, source_epoch: 1 } : null, account_readiness: 'not_assessed', snapshot_at: now },
          { backupId: choice.backupId, operationId: id, kind: 'commit', proposalHash: parent.wire.proposal_hash });
      }
    };
  }
};
function Harness() {
  const [english, setEnglish] = useState(false), [mount, setMount] = useState(0);
  return <main className="auth-shell"><h1>Commit V3 — prueba local</h1>
    <p>Datos sintéticos. No hay fondos ni autorización enviada. El gesto de llave se cancela deliberadamente.</p>
    <p>{Object.keys(counters).map(key => <span key={key}>{key}: <span id={key}>{counters[key]}</span>. </span>)}</p>
    <nav><button onClick={() => setEnglish(value => !value)}>ES / EN</button>
      <button onClick={() => { failure = !failure; }}>Simular error</button>
      <button onClick={() => { delay = !delay; }}>Simular espera</button>
      <button onClick={() => { current = {}; listeners.forEach(callback => callback({ uid: 'synthetic' })); }}>Reemplazar sesión</button>
      <button onClick={() => { if (wire) wire.state = 'authorized'; }}>Simular consentimiento aceptado</button>
      <button onClick={() => setMount(value => value + 1)}>Remontar panel</button>
      <label>Escenario de seguimiento <select defaultValue="pending" onChange={event => { progressMode = event.target.value; }}>
        <option value="pending">Pendiente</option><option value="confirmed">Política histórica</option>
        <option value="stale">Observación incierta posterior</option><option value="review">Revisión</option>
      </select></label>
    </nav>
    <section className="auth-panel"><BackupCommitPanel key={mount} runtime={runtime} uid="synthetic" pin={data.pin}
      context={data.context} english={english} /></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Commit V3 — local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (request.url === '/harness.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(result.outputFiles[0].text); return; }
  response.writeHead(404); response.end();
});
server.listen(4181, '127.0.0.1', () => console.log('V3 commit harness: http://127.0.0.1:4181 PID=' + process.pid));
