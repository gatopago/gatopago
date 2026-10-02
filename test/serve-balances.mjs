// Reproducible local UI harness; no Firebase, real RPC, signatures or funds.
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
import { WalletBalances } from './src/wallet/WalletBalances';
import { parseBalanceView } from './src/wallet/balances';
import { balanceFixture } from './test/balances.fixture';
const fixture = balanceFixture(), listeners = new Set();
let current = {}, failure = false, short = false, reads = 0, notify = () => {};
const runtime = { subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }, balances() {
  const captured = current;
  const assertCurrent = () => { if (captured !== current) throw Object.assign(new Error('changed'), { code: 'auth/session-changed' }); };
  return { assertCurrent, async accounts() { assertCurrent(); return { data: [fixture.account], next_cursor: null }; },
    async read() { reads++; notify(); assertCurrent(); if (failure) throw new Error('unavailable');
      const next = balanceFixture(); next.wire.wallet_id = fixture.account.wallet_id; next.wire.wallet_account_id = fixture.account.id;
      if (short) { next.wire.expires_at = next.now + 3; next.wire.finality_evidence.expires_at = next.now + 3; }
      return parseBalanceView(next.wire, fixture.account); } };
} };
function Harness() {
  const [english, setEnglish] = useState(false), [, update] = useState(0); notify = () => update(n => n + 1);
  return <main className="auth-shell"><h1>Saldo V3 — prueba local</h1><p>Datos sintéticos. Lecturas de saldo: {reads}</p>
    <nav><button onClick={() => setEnglish(v => !v)}>ES / EN</button><button onClick={() => { failure = !failure; }}>Simular error</button>
      <button onClick={() => { short = !short; }}>Caducar en 3 segundos</button>
      <button onClick={() => { current = {}; listeners.forEach(fn => fn({ uid: 'synthetic' })); }}>Reemplazar sesión</button></nav>
    <div className="auth-panel"><WalletBalances runtime={runtime} uid="synthetic" walletId={fixture.account.wallet_id} english={english} /></div></main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Saldo V3 local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405); res.end(); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/harness.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); }
  else { res.writeHead(404); res.end(); }
}).listen(4182, '127.0.0.1', () => console.log('Balance harness http://127.0.0.1:4182 PID=' + process.pid));
