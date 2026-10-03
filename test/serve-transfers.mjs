// Local synthetic UI only. No Firebase, RPC, signatures or remote funds.
import { buildBrowser, styles, webRoot as web } from './harness.mjs';
import { createServer } from 'node:http';
const css = await styles();
const bundle = await buildBrowser({ stdin: { contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletBalances } from './src/wallet/WalletBalances';
import { parseTransferStatus } from './src/wallet/transfers';
import { parseBalanceView } from './src/wallet/balances';
import { balanceFixture } from './test/balances.fixture';
const account = balanceFixture().account, listeners = new Set();
let session = {}, mode = 'pending', reads = 0, balanceReads = 0, balanceFailure = false, notify = () => {};
const reference = 'op_11111111-1111-4111-8111-111111111111';
const runtime = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, balances() {
  const captured = session, assertCurrent = () => { if (session !== captured) throw new Error('session changed'); };
  return { assertCurrent, async accounts() { assertCurrent(); return { data: [account], next_cursor: null }; },
    async read(_selected, signal) {
      balanceReads++; notify(); signal.throwIfAborted(); assertCurrent();
      if (balanceFailure) throw new Error('Synthetic balance failure');
      const next = balanceFixture(); next.wire.wallet_id = account.wallet_id; next.wire.wallet_account_id = account.id;
      if (mode === 'reconciled') next.wire.balances[1].amount_atomic = '11345987654';
      return parseBalanceView(next.wire, account);
    } };
}, transfers() {
  const captured = session, assertCurrent = () => { if (session !== captured) throw new Error('session changed'); };
  return { assertCurrent, async status(locator, signal) {
    reads++; notify(); assertCurrent();
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1500));
    signal.throwIfAborted(); assertCurrent(); if (mode === 'error') throw new Error('unavailable');
    const reconciled = mode === 'reconciled' || mode === 'reverted';
    const confirmed = reconciled || mode === 'confirmed' || mode === 'conflict';
    return parseTransferStatus({ ...locator, userop_hash: '0x' + '11'.repeat(32), status: mode === 'conflict' ? 'review_required'
      : reconciled ? 'reconciled' : confirmed ? 'confirmation_recorded' : 'delivery_pending', historical_confirmation: confirmed
      ? { transaction_hash: '0x' + '22'.repeat(32), outcome: mode === 'reverted' ? 'execution_reverted' : 'execution_succeeded', recorded_at: Math.floor(Date.now()/1000) } : null,
      settlement: 'not_assessed', send_enabled: false, funds_reserved: !reconciled }, locator);
  } };
} };
function Harness() {
 const [english, setEnglish] = useState(false), [, render] = useState(0); notify = () => render(n => n + 1);
 return <main className="consumer-ui"><div className="auth-frame auth-content"><h1>Seguimiento V3 — prueba local</h1>
  <p>Datos sintéticos. Consultas de envío: {reads}. Lecturas de saldo: {balanceReads}. Sin firmas ni fondos reales.</p><p>{reference}</p>
  <nav><button onClick={() => setEnglish(v => !v)}>ES / EN</button>
   <label>Escenario<select onChange={e => { mode = e.target.value; }}><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option>
    <option value="conflict">Conflicto</option><option value="reconciled">Reconciliado</option><option value="reverted">Revertido y reconciliado</option>
    <option value="error">Error</option><option value="slow">Lento</option></select></label>
   <button onClick={() => { balanceFailure = !balanceFailure; }}>Simular error de saldo</button>
   <button onClick={() => { session = {}; listeners.forEach(fn => fn({ uid: 'other' })); }}>Cambiar sesión</button></nav>
  <div className="auth-panel"><WalletBalances runtime={runtime} uid="synthetic" walletId={account.wallet_id} english={english} mode="activity" /></div></div></main>;
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
