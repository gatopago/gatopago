// Local synthetic UI only. No Firebase, RPC, signatures or remote funds.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = await readFile(resolve(web, 'src/app/base.css'), 'utf8') + await readFile(resolve(web, 'src/auth/auth.css'), 'utf8');
const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, stdin: { resolveDir: web, loader: 'tsx', contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TransferProgress } from './src/wallet/TransferProgress';
import { parseTransferStatus } from './src/wallet/transfers';
import { balanceFixture } from './test/balances.fixture';
const account = balanceFixture().account, listeners = new Set();
let session = {}, mode = 'pending', reads = 0, notify = () => {};
const reference = 'op_11111111-1111-4111-8111-111111111111';
const runtime = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, transfers() {
  const captured = session, assertCurrent = () => { if (session !== captured) throw new Error('session changed'); };
  return { assertCurrent, async status(locator, signal) {
    reads++; notify(); assertCurrent();
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1500));
    signal.throwIfAborted(); assertCurrent(); if (mode === 'error') throw new Error('unavailable');
    const confirmed = mode === 'confirmed' || mode === 'conflict';
    return parseTransferStatus({ ...locator, userop_hash: '0x' + '11'.repeat(32), status: mode === 'conflict' ? 'review_required'
      : confirmed ? 'confirmation_recorded' : 'delivery_pending', historical_confirmation: confirmed
      ? { transaction_hash: '0x' + '22'.repeat(32), outcome: 'execution_succeeded', recorded_at: Math.floor(Date.now()/1000) } : null,
      settlement: 'not_assessed', send_enabled: false, funds_reserved: true }, locator);
  } };
} };
function Harness() {
 const [english, setEnglish] = useState(false), [, render] = useState(0); notify = () => render(n => n + 1);
 return <main className="auth-shell"><h1>Seguimiento V3 — prueba local</h1><p>Datos sintéticos. Consultas: {reads}</p><p>{reference}</p>
  <nav><button onClick={() => setEnglish(v => !v)}>ES / EN</button>
   <label>Escenario<select onChange={e => { mode = e.target.value; }}><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option>
    <option value="conflict">Conflicto</option><option value="error">Error</option><option value="slow">Lento</option></select></label>
   <button onClick={() => { session = {}; listeners.forEach(fn => fn({ uid: 'other' })); }}>Cambiar sesión</button></nav>
  <div className="auth-panel"><TransferProgress runtime={runtime} uid="synthetic" account={account} english={english}/></div></main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Seguimiento V3 local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405); res.end(); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/harness.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); }
  else { res.writeHead(404); res.end(); }
}).listen(4183, '127.0.0.1', () => console.log('Transfer harness http://127.0.0.1:4183 PID=' + process.pid));
