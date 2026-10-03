// Local React harness with ephemeral synthetic P256 assertions. No Firebase,
// real authenticator, deployed account, RPC, relayer or financial transaction.
import { build } from 'esbuild';
import { buildBrowser, styles, webRoot as web } from './harness.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const fixtureFile = resolve(web,'output/playwright/money-fixture.mjs');
await build({ outfile: fixtureFile,bundle: true,platform: 'node',format: 'esm',stdin: { resolveDir: web,
  contents: `export { moneyFixture } from './test/money.fixture';
  export { writeMoneyDraft,readMoneyDraft,writeMoneyReview,readMoneyReview } from '@gatopago/shared/v3/money-review-record';
  export { serializeTransferConfirmation,parseTransferConfirmation } from '@gatopago/shared/v3/transfer-wire';
  export { createResourceId } from '@gatopago/shared/v3/primitives';
  export { maximumOperationGasCost } from '@gatopago/shared/v3/paymaster';
  export { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';` } });
const sdk = await import(pathToFileURL(fixtureFile).href), f = sdk.moneyFixture();
const credentials = [{ scope: f.keys.input.scope,credential_ref: sdk.createResourceId('operation'),credential_id: 'c3ludGhldGlj',
  public_key: f.keys.input.publicKey,device_availability: 'unknown',onchain_authority: 'not_assessed' }];
const data = JSON.stringify({ selection: f.selection,environment: f.environment,credentials });
const preparations = new Map(), metrics = { prepared: 0,proofs: 0,confirmed: 0,deliveries: 0,status_reads: 0 };
const css = await styles();
const result = await buildBrowser({ plugins: [{ name: 'synthetic-money-ceremony',setup(builder) {
    builder.onResolve({ filter: /^\.\/passkeys$/ },() => ({ path: 'synthetic-proof',namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/,namespace: 'synthetic' },() => ({ loader: 'js',contents: `
      export async function requestPasskeyProof(input) {
        if (new URLSearchParams(location.search).has('cancel')) throw new Error('Synthetic cancellation');
        const response = await fetch('/proof?digest='+encodeURIComponent(input.challenge),{ signal:input.signal,cache:'no-store' });
        return response.json();
      }` }));
  } }],stdin: { resolveDir: web,loader: 'tsx',contents: `
    import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client';
    import { WalletMoney } from './src/wallet/WalletMoney';
    import { parseMoneyPreparation,parseMoneyPreparationHistory,parseMoneyStatus,parseMoneyConfirmation } from './src/wallet/money';
    import { serializeTransferConfirmation } from '@gatopago/shared/v3/transfer-wire';
    const data=JSON.parse(${JSON.stringify(data)}), s=data.selection;
    const mode=new URLSearchParams(location.search).has('pay')?'pay':'grow', en=new URLSearchParams(location.search).has('en');
    async function rpc(path,body) { const response=await fetch(path,{ method:body?'POST':'GET',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}) });
      if (!response.ok) throw new Error('Synthetic API failure'); return response.json(); }
    const session={ assertCurrent(){},environment:data.environment,selection(){return s;},
      async capabilities(){return {features:{aave_supply:true,aave_withdraw:true,aave_withdraw_and_pay:true},expires_at:Math.floor(Date.now()/1000)+30};},
      async position(){return {usdc_balance_atomic:'100000000',position_balance_atomic:'40000000',debt_base_atomic:'0',active:true,paused:false,frozen:false,expires_at:Math.floor(Date.now()/1000)+30};},
      async prepare(_s,request){return parseMoneyPreparation(await rpc('/prepare',request),s,request,data.environment);},
      async restorePreparation(_s,id){return parseMoneyPreparationHistory(await rpc('/preparation?id='+id),s,data.environment,id);},
      async confirm(_s,p,proofs){const wire=serializeTransferConfirmation(p.candidate.digest,proofs);
        return parseMoneyConfirmation(await rpc('/confirm',{id:p.preparation_id,proofs:wire.proofs}),p);},
      async deliver(_s,p,id){return rpc('/deliver'+(new URLSearchParams(location.search).has('timeout')?'?timeout=1':''),{id});},
      async status(_s,id){return parseMoneyStatus(await rpc('/status?id='+id),s,data.environment,id);}
    };
    const runtime={ subscribe(){return ()=>{};},accountContexts(){return {assertCurrent(){},async read(){return s;}};},async money(){return session;},
      credentialInventory(){return {assertCurrent(){},async read(){return {data:data.credentials};},async detail(){return data.credentials[0];}};}
    };
    createRoot(document.getElementById('root')).render(<StrictMode><main className="app-frame mx-auto max-w-[480px] px-6 py-6">
      <p role="note">Prueba local: cuenta, posición y passkey sintéticas. Sin fondos ni transacciones públicas.</p>
      <WalletMoney runtime={runtime} uid="synthetic" account={{id:s.wallet_account_id,wallet_id:s.wallet_id,network_id:s.network_id}} english={en} mode={mode}/>
    </main></StrictMode>);
  ` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Money local harness</title><style>${css}</style></head><body class="consumer-ui"><div id="root"></div><script src="/harness.js"></script></body></html>`;
const json = (res,value) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  const url = new URL(req.url,'http://127.0.0.1');
  try {
    if (url.pathname === '/metrics') return json(res,metrics);
    if (url.pathname === '/proof') {
      const value = [...preparations.values()].find(p => p.candidate.digest === url.searchParams.get('digest'));
      if (!value) throw new Error('No synthetic review'); metrics.proofs++;
      return json(res,sdk.serializeTransferConfirmation(value.candidate.digest,[{signerIndex:0,kind:'webauthn',assertion:f.keys.assertion(value.candidate.digest)}]).proofs[0].assertion);
    }
    if (url.pathname === '/preparation') {
      const value = preparations.get(url.searchParams.get('id')); if (!value) throw new Error('No synthetic review');
      return json(res,{...value.wire,state:Math.floor(Date.now()/1000)>=value.candidate.plan.validUntil?'expired_unsigned':'prepared',operation_id:value.operationId});
    }
    if (url.pathname === '/status') {
      const value = [...preparations.values()].find(p => p.operationId === url.searchParams.get('id')); if (!value) throw new Error('No synthetic operation'); metrics.status_reads++;
      return json(res,{...f.status,operation_id:value.operationId,preparation_id:value.wire.preparation_id,consent_digest:value.candidate.digest,userop_hash:value.candidate.userOpHash,
        review_json:value.wire.review_json,review_sha256:value.wire.review_sha256,expires_at:value.candidate.plan.validUntil,
        state:value.dispatched?'dispatch_pending':'authorized',dispatched_at:value.dispatched,job:value.dispatched?{state:'running',reason:null,failures:0}:null});
    }
    if (req.method === 'POST') {
      let bytes = ''; for await (const part of req) { bytes += part; if (bytes.length > 100_000) throw new Error('Synthetic request too large'); }
      const input = JSON.parse(bytes);
      if (url.pathname === '/prepare') {
        const now = Math.floor(Date.now()/1000), context = { ...f.review.context,gas:Object.fromEntries(Object.entries(f.selection.gas.limits[input.kind]).map(([key,value])=>[key,BigInt(value)])),
          checkpoint:{...f.review.context.checkpoint,observed_at:now,expires_at:now+30},valid_until:now+30 };
        context.budget = { ...context.budget, maximum_native_gas_atomic:sdk.maximumOperationGasCost(context.gas).toString() };
        const review = {...f.review,request:input,context,prepared_at:now}, draft = sdk.writeMoneyDraft(review), candidate = sdk.readMoneyDraft(draft.json,draft.digest).candidate;
        const id = sdk.createResourceId('operation'), wire = {...f.wire,preparation_id:id,consent_digest:candidate.digest,review_json:draft.json,review_sha256:draft.digest,expires_at:candidate.plan.validUntil};
        preparations.set(id,{wire,candidate,review,operationId:null,dispatched:null}); metrics.prepared++; return json(res,wire);
      }
      if (url.pathname === '/confirm') {
        const value = preparations.get(input.id); if (!value) throw new Error('No synthetic review');
        const proofs = sdk.parseTransferConfirmation({consent_digest:value.candidate.digest,proofs:input.proofs}).proofs;
        const review = sdk.writeMoneyReview({...value.review,approved_at:Math.floor(Date.now()/1000),proofs}); await sdk.readMoneyReview(review.json,review.digest);
        value.operationId ??= sdk.createResourceId('operation'); metrics.confirmed++;
        return json(res,{id:value.operationId,preparation_id:input.id,consent_digest:value.candidate.digest,state:'authorized',expires_at:value.candidate.plan.validUntil,send_enabled:false});
      }
      if (url.pathname === '/deliver') {
        const value = [...preparations.values()].find(p=>p.operationId===input.id); if (!value) throw new Error('No synthetic operation');
        if (!value.dispatched) {value.dispatched=Math.floor(Date.now()/1000);metrics.deliveries++;}
        if (url.searchParams.has('timeout')) {res.writeHead(202,{'Content-Type':'application/json'});res.write('{');setTimeout(()=>res.destroy(),10);return;}
        return json(res,{operation_id:value.operationId,state:'dispatch_pending',delivery:'accepted'});
      }
    }
    if (req.method !== 'GET') {res.writeHead(405);return res.end();}
    if (url.pathname === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
    if (url.pathname === '/harness.js') {res.setHeader('Content-Type','application/javascript');return res.end(result.outputFiles[0].text);}
    res.writeHead(404);res.end();
  } catch {res.writeHead(409,{'Content-Type':'application/json'});res.end('{"error":"synthetic harness refusal"}');}
}).listen(4185,'127.0.0.1',()=>console.log('Money UI local harness http://127.0.0.1:4185'));
