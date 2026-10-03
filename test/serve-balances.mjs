// Reproducible local UI harness; no Firebase, real RPC, signatures or funds.
import { buildBrowser, styles } from './harness.mjs';
import { createServer } from 'node:http';
const css = await styles();
const bundle = await buildBrowser({ stdin: { contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletBalances } from './src/wallet/WalletBalances';
import { ProfileEditor } from './src/consumer/ProfileEditor';
import { parseBalanceView } from './src/wallet/balances';
import { balanceFixture } from './test/balances.fixture';
const fixture = balanceFixture(), listeners = new Set();
let current = {}, failure = false, short = false, reads = 0, publications = 0, notify = () => {};
let profile = { user_id: 'synthetic', display_name: 'Daniel', username: 'daniel', username_reserved_until: null,
  username_published_at: null, receiving_wallet_id: null };
const runtime = { subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }, balances() {
  const captured = current;
  const assertCurrent = () => { if (captured !== current) throw Object.assign(new Error('changed'), { code: 'auth/session-changed' }); };
  return { assertCurrent, async accounts() { assertCurrent(); return { data: [fixture.account], next_cursor: null }; },
    async read() { reads++; notify(); assertCurrent(); if (failure) throw new Error('unavailable');
      const next = balanceFixture(); next.wire.wallet_id = fixture.account.wallet_id; next.wire.wallet_account_id = fixture.account.id;
      if (short) { next.wire.expires_at = next.now + 3; next.wire.finality_evidence.expires_at = next.now + 3; }
      return parseBalanceView(next.wire, fixture.account); } };
}, async wallets() { return { data: [{ id: fixture.account.wallet_id, status: 'active' }], next_cursor: null }; },
  profile() {
    const captured = current;
    const assertCurrent = () => { if (captured !== current) throw Object.assign(new Error('changed'), { code: 'auth/session-changed' }); };
    return { assertCurrent, async read() { assertCurrent(); return profile; },
      async rename(name) { assertCurrent(); profile = { ...profile, display_name: name }; return profile; },
      async publish(username, walletId, accountId) {
        assertCurrent(); if (walletId !== fixture.account.wallet_id || accountId !== fixture.account.id) throw new Error('Wrong selection');
        publications++; notify(); profile = { ...profile, username, username_published_at: Math.floor(Date.now() / 1000), receiving_wallet_id: walletId }; return profile;
      } };
  } };
function Harness() {
  const [english, setEnglish] = useState(false), [, update] = useState(0); notify = () => update(n => n + 1);
  return <main className="consumer-ui"><div className="auth-frame auth-content"><h1>Saldo V3 — prueba local</h1><p>Datos sintéticos. Lecturas de saldo: {reads}. Publicaciones: {publications}</p>
    <nav><button onClick={() => setEnglish(v => !v)}>ES / EN</button><button onClick={() => { failure = !failure; }}>Simular error</button>
      <button onClick={() => { short = !short; }}>Caducar en 3 segundos</button>
      <button onClick={() => { current = {}; listeners.forEach(fn => fn({ uid: 'synthetic' })); }}>Reemplazar sesión</button></nav>
    <div className="auth-panel"><WalletBalances runtime={runtime} uid="synthetic" walletId={fixture.account.wallet_id} english={english} /></div>
    <div className="auth-panel"><ProfileEditor runtime={runtime} uid="synthetic" english={english} /></div></div></main>;
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
