                                                                                             
                                                                                              
import { buildBrowser, styles } from './harness.mjs';
import { createServer } from 'node:http';

const css = await styles();
const result = await buildBrowser({ stdin: { contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletOverview } from './src/wallet/WalletOverview';
import { WalletCoreError } from './src/wallet/core';
let calls = 0;
let fail = false;
let delay = false;
const runtime = { async wallets(uid, signal, after) {
  calls++; document.getElementById('calls').textContent = String(calls);
  if (delay) await new Promise(resolve => setTimeout(resolve, 1500));
  signal.throwIfAborted();
  if (fail) throw new WalletCoreError('wallet/unavailable');
  if (uid === 'b') return { data: [], next_cursor: null };
  return { data: [{ id: after ? 'wallet-second' : 'wallet-first', user_id: 'owner-a', status: after ? 'archived' : 'active' }], next_cursor: after ? null : 'next' };
} };
function Harness() {
  const [uid, setUid] = useState('a');
  const [generation, setGeneration] = useState(0);
  function scenario(kind) {
    fail = kind === 'failure'; delay = kind === 'slow'; calls = 0;
    document.getElementById('calls').textContent = '0';
    setUid('a'); setGeneration(value => value + 1);
  }
  return <main className="auth-shell">
    <h1>Wallet V3 — prueba sintética</h1>
    <p>Usuario visible: {uid}</p>
    <nav>
      <button onClick={() => scenario('normal')}>Datos normales</button>
      <button onClick={() => scenario('failure')}>Simular fallo</button>
      <button onClick={() => { fail = false; }}>Restaurar servicio</button>
      <button onClick={() => scenario('slow')}>Consulta lenta</button>
      <button onClick={() => setUid('b')}>Cambiar a usuario B</button>
    </nav>
    <section className="auth-panel"><WalletOverview key={uid + generation} runtime={runtime} uid={uid} english={false} /></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const script = result.outputFiles[0].text;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url === '/harness.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); return; }
  if (request.url !== '/') { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V3 synthetic wallet test</title>
    <style>body{margin:0;background:#fff8ef;font-family:system-ui}nav{display:flex;gap:8px;flex-wrap:wrap}button{padding:10px}${css}</style>
    <div id="root"></div><p>Solicitudes simuladas: <span id="calls">0</span></p><script src="/harness.js"></script></html>`);
});
server.listen(4177, '127.0.0.1', () => process.stdout.write('Synthetic wallet harness: http://127.0.0.1:4177\n'));
