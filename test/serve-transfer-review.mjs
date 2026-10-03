// Actual React UI; synthetic public account and a deliberately cancelled
// ceremony adapter. No Firebase, real authenticator, RPC or remote funds.
import { build } from 'esbuild';
import { buildBrowser, styles, webRoot as web } from './harness.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const fixtureFile = resolve(web,'output/playwright/v3-transfer-review-fixture.mjs');
await build({ outfile:fixtureFile,bundle:true,platform:'node',format:'esm',stdin:{ resolveDir:web,
  contents:"export { transferFixture } from '@gatopago/test-fixtures/v3-transfer'; export { writeTransferDraft,readTransferDraft } from '@gatopago/shared/v3/transfer-review-record'; export { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';" } });
const { transferFixture,writeTransferDraft,readTransferDraft,CLIENT_RELEASE_ID } = await import(pathToFileURL(fixtureFile).href), f = transferFixture();
const data = { request:f.request,context:f.context,policy:f.approval.policy,scope:f.approval.scope,document:f.approval.security_evidence.document };
const json = JSON.stringify(data,(_,value) => typeof value === 'bigint' ? { bigint:value.toString() } : value);
const css = await styles();
let restorationMode = 'held', restoreReads = 0, restoreDeliveries = 0, restoreDeliveryRequests = 0, balanceReads = 0;
const restoreBase = transferFixture(false);
function newRestoration() {
  const now = Math.floor(Date.now()/1000), request = { ...restoreBase.request,client_release_id:CLIENT_RELEASE_ID };
  const context = { ...restoreBase.context,checkpoint:{ ...restoreBase.context.checkpoint,observed_at:now,expires_at:now+60 },valid_until:now+60 };
  const draft = writeTransferDraft({ request,context,policy:restoreBase.approval.policy,scope:restoreBase.approval.scope,prepared_at:now });
  const candidate = readTransferDraft(draft.json,draft.digest).candidate;
  const selected = { wallet_id:request.wallet_id,wallet_account_id:'wac_11111111-1111-4111-8111-111111111111',network_id:request.network_id,
    address:context.account,account_id:context.account_id,deployment:{ document:restoreBase.approval.security_evidence.document,digest:context.deployment_digest } };
  const bookmark = { wallet_id:selected.wallet_id,wallet_account_id:selected.wallet_account_id,network_id:selected.network_id,
    consent_digest:candidate.digest,expires_at:candidate.plan.validUntil };
  return { selected,bookmark,draft,candidate,metadata:[{ asset_id:request.asset_id,decimals:6,symbol:'USDC' },{ asset_id:context.native_asset_id,decimals:18,symbol:'ETH' }] };
}
let restoration = newRestoration();
function restorationWire() {
  const now = Math.floor(Date.now()/1000), missing = restorationMode === 'absent';
  const state = restorationMode === 'held' && now >= restoration.bookmark.expires_at ? 'expired' : restorationMode;
  const recorded = ['reconciled','review_required','confirmation_recorded'].includes(state);
  return { schema_version:1,consent_digest:restoration.candidate.digest,review_json:missing ? null : restoration.draft.json,
    review_sha256:missing ? null : restoration.draft.digest,asset_metadata:missing ? null : restoration.metadata,checked_at:now,status:missing ? null : {
      wallet_id:restoration.selected.wallet_id,wallet_account_id:restoration.selected.wallet_account_id,network_id:restoration.selected.network_id,
      operation_id:'op_33333333-3333-4333-8333-333333333333',userop_hash:restoration.candidate.userOpHash,status:state,
      historical_confirmation:recorded ? { transaction_hash:'0x'+'ab'.repeat(32),outcome:'execution_succeeded',recorded_at:now } : null,
      funds_reserved:state !== 'expired' && state !== 'reconciled',settlement:'not_assessed',send_enabled:false } };
}
const restorationJSON = JSON.stringify({ selected:restoration.selected,bookmark:restoration.bookmark,metadata:restoration.metadata });
const result = await buildBrowser({ bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
  plugins:[{ name:'synthetic-cancelled-signature',setup(builder) {
    // This is a component harness, not a Next server: only adapt its read-only
    // navigation hook. Production routing is checked by the real Next build.
    builder.onResolve({ filter:/^next\/navigation$/ },() => ({ path:'navigation',namespace:'synthetic-navigation' }));
    builder.onLoad({ filter:/.*/,namespace:'synthetic-navigation' },() => ({ contents:'export function useSearchParams() { return new URLSearchParams(location.search); }',loader:'js' }));
    builder.onResolve({ filter:/^next\/dynamic$/ },() => ({ path:'dynamic',namespace:'synthetic-dynamic' }));
    builder.onLoad({ filter:/.*/,namespace:'synthetic-dynamic' },() => ({ contents:`import { lazy,Suspense } from 'react';
      export default function dynamic(load) { const Component = lazy(async () => ({ default:await load() }));
        return function Adapter(props) { return <Suspense fallback={null}><Component {...props}/></Suspense>; }; }`,loader:'tsx',resolveDir:web }));
    builder.onResolve({ filter:/^\.\/passkeys$/ },() => ({ path:'cancelled',namespace:'synthetic' }));
    builder.onLoad({ filter:/.*/,namespace:'synthetic' },() => ({ contents:`export async function requestPasskeyProof() {
      window.syntheticTransferCeremony(); throw new Error('Synthetic cancellation'); }`,loader:'js' }));
  }}],define:{ 'process.env.NODE_ENV':'"development"' },stdin:{ resolveDir:web,loader:'tsx',contents:`
import { StrictMode,useState } from 'react';
import environments from '@gatopago/environment/environments.json';
import { createRoot } from 'react-dom/client';
import { TransferReview } from './src/wallet/TransferReview';
import { TransferEntry } from './src/wallet/TransferEntry';
import { WalletBalances } from './src/wallet/WalletBalances';
import { writeTransferDraft,readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { saveTransferBookmark } from './src/wallet/transfer-bookmark';
import { parseTransferRestoration } from './src/wallet/transfer-restoration';
const data = JSON.parse(${JSON.stringify(json)},(_,v) => v && typeof v === 'object' && Object.keys(v).length === 1 && 'bigint' in v ? BigInt(v.bigint) : v);
let session = {}, ceremonies = 0, commands = 0, pendingPreparation = null; const listeners = new Set();
const restoreData = JSON.parse(${JSON.stringify(restorationJSON)}), restorationMode = new URLSearchParams(location.search).has('restore');
const overviewMode = restorationMode && new URLSearchParams(location.search).has('overview');
if (restorationMode && !location.hash) saveTransferBookmark(restoreData.bookmark);
window.syntheticTransferCeremony = () => { document.getElementById('ceremonies').textContent = String(++ceremonies); };
const runtime = { subscribe(fn) { listeners.add(fn); fn({ uid:'synthetic' }); return () => listeners.delete(fn); },
  balances() { const captured = session, assertCurrent = () => { if (captured !== session) throw new Error('Changed'); };
    return { assertCurrent,async accounts() { assertCurrent(); return { data:[{ id:restoreData.selected.wallet_account_id,
      wallet_id:restoreData.selected.wallet_id,network_id:restoreData.selected.network_id }],next_cursor:null }; },
      async read(_account,signal) { assertCurrent(); await fetch('/synthetic-balance',{ signal,cache:'no-store' }); assertCurrent();
        throw new Error('Synthetic balance RPC outage'); } }; },
  accountContexts() { const captured = session; return { environment:environments.production,assertCurrent() { if (captured !== session) throw new Error('Changed'); },
    async read() { return restorationMode ? restoreData.selected : newReview().selected; } }; },
  transferRestoration() { const captured = session, assertCurrent = () => { if (captured !== session) throw new Error('Changed'); };
    return { assertCurrent,async restore(selected,bookmark,signal) {
      assertCurrent(); const response = await fetch('/synthetic-transfer',{ signal,cache:'no-store' }); const wire = await response.json(); assertCurrent();
      return parseTransferRestoration(wire,selected,bookmark,environments.production);
    },async deliver(_selected,_bookmark,_wire,signal) { assertCurrent(); const response = await fetch('/synthetic-deliver',{ method:'POST',signal }); assertCurrent(); return response.json(); } }; },
  credentialInventory() { const captured = session; return { assertCurrent() { if (captured !== session) throw new Error('Changed'); },
    async read() { return { data:newReview().credentials }; },async detail() { return newReview().credentials[0]; } }; },
  transferPreparations() { const captured = session; return { assertCurrent() { if (captured !== session) throw new Error('Changed'); },
    async prepare(_selected,request) { return new Promise(resolve => { pendingPreparation = () => resolve(newReview(request).review); }); } }; },
  transferCommands() { const captured = session; return { assertCurrent() { if (captured !== session) throw new Error('Changed'); },
    async confirm() { commands++; throw new Error('Unexpected command'); },async deliver() { commands++; throw new Error('Unexpected command'); } }; },
  transfers() { const captured = session; return { assertCurrent() { if (captured !== session) throw new Error('Changed'); },async status() { throw new Error('No operation'); } }; } };
function newReview(requestOverride) {
  const now = Math.floor(Date.now()/1000), request = { ...(requestOverride ?? data.request),client_release_id:CLIENT_RELEASE_ID };
  const context = { ...data.context,checkpoint:{ ...data.context.checkpoint,observed_at:now,expires_at:now+60 },valid_until:now+60 };
  const draft = writeTransferDraft({ request,context,policy:data.policy,scope:data.scope,prepared_at:now });
  const candidate = readTransferDraft(draft.json,draft.digest).candidate;
  const selected = { wallet_id:request.wallet_id,wallet_account_id:'wac_11111111-1111-4111-8111-111111111111',
    network_id:request.network_id,address:context.account,account_id:context.account_id,deployment:{ document:data.document,digest:context.deployment_digest } };
  const review = { wire:{ schema_version:1,preparation_id:'op_11111111-1111-4111-8111-111111111111',wallet_id:selected.wallet_id,
    wallet_account_id:selected.wallet_account_id,consent_digest:candidate.digest,review_json:draft.json,review_sha256:draft.digest,
    expires_at:now+60,send_enabled:false } };
  const credentials = [{ scope:data.scope,credential_ref:'op_22222222-2222-4222-8222-222222222222',credential_id:'c3ludGhldGlj',
    public_key:data.policy.signers.find(s => s.kind === 1).key,device_availability:'unknown',onchain_authority:'not_assessed' }];
  return { selected,request,review,credentials,metadata:[{ asset_id:request.asset_id,decimals:18,symbol:'ETH' }] };
}
function Harness() {
  const [value,setValue] = useState(() => newReview()), [en,setEn] = useState(false), [missingBalance,setMissingBalance] = useState(() => new URLSearchParams(location.search).has('missing-balance'));
  const entryMode = restorationMode || new URLSearchParams(location.search).has('entry'), selected = restorationMode ? restoreData.selected : value.selected;
  const account = { id:selected.wallet_account_id,wallet_id:selected.wallet_id,network_id:selected.network_id };
  const balance = { account,address:selected.address,observed_at:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+30,
    block_number:'1',block_hash:'0x'+'ab'.repeat(32),assets:(restorationMode ? restoreData.metadata : value.metadata).map(a => ({ ...a,amount_atomic:'1000000000000000000' })) };
  return <main className="auth-shell"><h1>Revisión V3 — prueba local</h1><p>Firmas solicitadas: <span id="ceremonies">0</span>. Sin fondos reales.</p>
    <nav><button onClick={() => setValue(newReview())}>Nueva revisión</button><button onClick={() => setEn(v => !v)}>ES / EN</button>
      <button onClick={() => { session = {}; listeners.forEach(fn => fn({ uid:'other' })); }}>Cambiar sesión</button>
      {restorationMode ? <><button onClick={async () => { await fetch('/synthetic-state?mode=reconciled',{ method:'POST' }); }}>Marcar reconciliado</button>
        <button onClick={async () => { await fetch('/synthetic-state?mode=review_required',{ method:'POST' }); }}>Marcar conflicto</button>
        <button onClick={async () => { const response = await fetch('/synthetic-reset',{ method:'POST' }); const bookmark = await response.json();
          history.replaceState(history.state,'',location.pathname+location.search); saveTransferBookmark(bookmark); }}>Nueva reserva sintética</button></> : null}
      {entryMode ? <><button onClick={() => { const finish = pendingPreparation; pendingPreparation = null; finish?.(); }}>Resolver preparación</button>
        <button onClick={() => setMissingBalance(true)}>Vencer saldo mostrado</button></> : null}</nav>
    <div className="auth-panel">{overviewMode ? <WalletBalances runtime={runtime} uid="synthetic" walletId={account.wallet_id} english={en} mode="send"/>
      : entryMode ? <TransferEntry runtime={runtime} uid="synthetic" account={account} balance={missingBalance ? null : balance} english={en}/>
      : <TransferReview {...value} runtime={runtime} uid="synthetic" environment={environments.production} english={en}/>}</div></main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Revisión V3 local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
createServer((req,res) => { res.setHeader('Cache-Control','no-store');
  if (req.method === 'GET' && req.url === '/synthetic-transfer') { restoreReads++; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(restorationWire())); }
  else if (req.method === 'GET' && req.url === '/synthetic-metrics') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ restoreReads,restoreDeliveryRequests,restoreDeliveries,balanceReads })); }
  else if (req.method === 'GET' && req.url === '/synthetic-balance') { balanceReads++; res.writeHead(503,{ 'Content-Type':'application/json' }); res.end('{"error":"synthetic balance outage"}'); }
  else if (req.method === 'POST' && req.url === '/synthetic-deliver') {
    restoreDeliveryRequests++;
    if (restorationMode !== 'held') { res.writeHead(409,{ 'Content-Type':'application/json' }); res.end('{"error":"already claimed"}'); }
    else {
      restoreDeliveries++; restorationMode = 'delivery_pending';
      // Drop a response after headers/partial bytes, not an idle connection:
      // browsers may transparently retry a request on a stale socket. The real
      // backend's atomic claim protects either case; model one accepted claim.
      res.writeHead(202,{ 'Content-Type':'application/json' }); res.write('{'); setTimeout(() => res.destroy(),10);
    }
  }
  else if (req.method === 'POST' && req.url === '/synthetic-reset') { restoration = newRestoration(); restorationMode = 'held';
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(restoration.bookmark)); }
  else if (req.method === 'POST' && req.url?.startsWith('/synthetic-state?mode=')) {
    const mode = new URL(req.url,'http://127.0.0.1').searchParams.get('mode');
    if (!['held','delivery_pending','reconciled','review_required','absent'].includes(mode)) { res.writeHead(400); res.end(); }
    else { restorationMode = mode; res.end('{}'); }
  }
  else if (req.method !== 'GET') { res.writeHead(405); res.end(); }
  else if (new URL(req.url,'http://localhost').pathname === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/harness.js') { res.setHeader('Content-Type','application/javascript'); res.end(result.outputFiles[0].text); }
  else { res.writeHead(404); res.end(); }
}).listen(4184,'127.0.0.1',() => console.log('Transfer review harness http://127.0.0.1:4184 PID='+process.pid));
