// Actual React review UI with synthetic public credentials and identity only.
// No real Firebase session, admitted chain, funds, signatures or account mutation.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFile = resolve(webRoot, 'output/playwright/v3-policy-fixture.mjs');
await build({ outfile: fixtureFile, bundle: true, platform: 'node', format: 'esm', stdin: { resolveDir: webRoot,
  contents: "export { policyReviewFixture } from './test/backup-policy.fixture';" } });
const { policyReviewFixture } = await import(pathToFileURL(fixtureFile).href);
const fixture = policyReviewFixture();
const publicData = { consent: fixture.consent, inventory: fixture.inventory, pin: fixture.pin, material: fixture.material };
const css = await readFile(resolve(webRoot, 'src/app/base.css'), 'utf8') + await readFile(resolve(webRoot, 'src/auth/auth.css'), 'utf8');
const result = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, stdin: { resolveDir: webRoot, sourcefile: 'policy-harness.tsx', loader: 'tsx', contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BackupPolicyReview from './src/wallet/BackupPolicyReview';
import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
const data = ${JSON.stringify(publicData)};
let current = {}, failure = false, delay = false, reads = 0, ceremonies = 0;
const listeners = new Set();
function countCeremony() { ceremonies++; document.getElementById('ceremonies').textContent = String(ceremonies); throw new Error('Unexpected ceremony'); }
Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: countCeremony, create: countCeremony } });
const runtime = {
  subscribe(callback) { listeners.add(callback); callback({ uid: 'synthetic' }); return () => listeners.delete(callback); },
  credentialInventory(uid) {
    const captured = current;
    const assertCurrent = () => { if (captured !== current || uid !== 'synthetic') throw { code: 'auth/session-changed' }; };
    return { assertCurrent, async detail(reference, signal) {
      assertCurrent(); reads++; document.getElementById('reads').textContent = String(reads);
      if (delay) await new Promise(resolve => setTimeout(resolve, 3000));
      signal.throwIfAborted(); assertCurrent();
      if (failure) throw { code: 'credentials/unavailable' };
      const value = data.material.find(row => row.credential_ref === reference);
      return parseCredentialDetail(value, data.consent.expected.scope, reference);
    } };
  },
};
function Harness() {
  const [english, setEnglish] = useState(false), [mount, setMount] = useState(0), [active, setActive] = useState(false);
  return <main className="auth-shell"><h1>Revisión V3 — prueba local</h1>
    <p>Datos sintéticos. Sin fondos, sin sesión real, sin cambios onchain.</p>
    <p>Lecturas: <span id="reads">0</span>. Ceremonias: <span id="ceremonies">0</span>. Edición/operación bloqueada: {String(active)}.</p>
    <nav><button onClick={() => setEnglish(value => !value)}>ES / EN</button>
      <button onClick={() => { failure = !failure; }}>Simular error</button>
      <button onClick={() => { delay = !delay; }}>Simular espera</button>
      <button onClick={() => { current = {}; listeners.forEach(callback => callback({ uid: 'synthetic' })); }}>Reemplazar sesión</button>
      <button onClick={() => setMount(value => value + 1)}>Reiniciar revisión</button></nav>
    <section className="auth-panel"><BackupPolicyReview key={mount} runtime={runtime} uid="synthetic" english={english}
      consent={data.consent} inventory={data.inventory} pin={data.pin} onActiveChange={setActive} /></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Revisión de política V3 — local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (request.url === '/harness.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(result.outputFiles[0].text); return; }
  response.writeHead(404); response.end();
});
server.listen(4180, '127.0.0.1', () => console.log(`V3 policy review fixture: http://127.0.0.1:4180 PID=${process.pid}`));
