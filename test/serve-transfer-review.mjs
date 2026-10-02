// Actual React UI; synthetic public account and a deliberately cancelled
// ceremony adapter. No Firebase, real authenticator, RPC or remote funds.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFile = resolve(web,'output/playwright/v3-transfer-review-fixture.mjs');
await build({ outfile:fixtureFile,bundle:true,platform:'node',format:'esm',stdin:{ resolveDir:web,
  contents:"export { transferFixture } from '@gatopago/test-fixtures/v3-transfer';" } });
const { transferFixture } = await import(pathToFileURL(fixtureFile).href), f = transferFixture();
const data = { request:f.request,context:f.context,policy:f.approval.policy,scope:f.approval.scope,document:f.approval.security_evidence.document };
const json = JSON.stringify(data,(_,value) => typeof value === 'bigint' ? { bigint:value.toString() } : value);
const css = await readFile(resolve(web,'src/app/base.css'),'utf8') + await readFile(resolve(web,'src/auth/auth.css'),'utf8');
const result = await build({ bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
  plugins:[{ name:'synthetic-cancelled-signature',setup(builder) {
    builder.onResolve({ filter:/^\.\/passkeys$/ },() => ({ path:'cancelled',namespace:'synthetic' }));
    builder.onLoad({ filter:/.*/,namespace:'synthetic' },() => ({ contents:`export async function requestPasskeyProof() {
      window.syntheticTransferCeremony(); throw new Error('Synthetic cancellation'); }`,loader:'js' }));
  }}],define:{ 'process.env.NODE_ENV':'"development"' },stdin:{ resolveDir:web,loader:'tsx',contents:`
import { StrictMode,useState } from 'react';
import environments from '@gatopago/environment/environments.json';
import { createRoot } from 'react-dom/client';
import { TransferReview } from './src/wallet/TransferReview';
import { TransferEntry } from './src/wallet/TransferEntry';
import { writeTransferDraft,readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
const data = JSON.parse(${JSON.stringify(json)},(_,v) => v && typeof v === 'object' && Object.keys(v).length === 1 && 'bigint' in v ? BigInt(v.bigint) : v);
let session = {}, ceremonies = 0, commands = 0, pendingPreparation = null; const listeners = new Set();
window.syntheticTransferCeremony = () => { document.getElementById('ceremonies').textContent = String(++ceremonies); };
const runtime = { subscribe(fn) { listeners.add(fn); fn({ uid:'synthetic' }); return () => listeners.delete(fn); },
  accountContexts() { const captured = session; return { environment:environments.staging,assertCurrent() { if (captured !== session) throw new Error('Changed'); },
    async read() { return newReview().selected; } }; },
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
  const [value,setValue] = useState(() => newReview()), [en,setEn] = useState(false), [missingBalance,setMissingBalance] = useState(false);
  const entryMode = new URLSearchParams(location.search).has('entry'), selected = value.selected;
  const account = { id:selected.wallet_account_id,wallet_id:selected.wallet_id,network_id:selected.network_id };
  const balance = { account,address:selected.address,observed_at:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+30,
    block_number:'1',block_hash:'0x'+'ab'.repeat(32),assets:value.metadata.map(a => ({ ...a,amount_atomic:'1000000000000000000' })) };
  return <main className="auth-shell"><h1>Revisión V3 — prueba local</h1><p>Firmas solicitadas: <span id="ceremonies">0</span>. Sin fondos reales.</p>
    <nav><button onClick={() => setValue(newReview())}>Nueva revisión</button><button onClick={() => setEn(v => !v)}>ES / EN</button>
      <button onClick={() => { session = {}; listeners.forEach(fn => fn({ uid:'other' })); }}>Cambiar sesión</button>
      {entryMode ? <><button onClick={() => { const finish = pendingPreparation; pendingPreparation = null; finish?.(); }}>Resolver preparación</button>
        <button onClick={() => setMissingBalance(true)}>Vencer saldo mostrado</button></> : null}</nav>
    <div className="auth-panel">{entryMode ? <TransferEntry runtime={runtime} uid="synthetic" account={account} balance={missingBalance ? null : balance} english={en}/>
      : <TransferReview {...value} runtime={runtime} uid="synthetic" environment={environments.staging} english={en}/>}</div></main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Revisión V3 local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
createServer((req,res) => { res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') { res.writeHead(405); res.end(); }
  else if (req.url === '/' || req.url === '/?entry') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/harness.js') { res.setHeader('Content-Type','application/javascript'); res.end(result.outputFiles[0].text); }
  else { res.writeHead(404); res.end(); }
}).listen(4184,'127.0.0.1',() => console.log('Transfer review harness http://127.0.0.1:4184 PID='+process.pid));
