// Local browser acceptance harness: actual React UI, WebAuthn adapters and server cryptographic verifier.
// Synthetic identity + in-memory persistence; NOT Firebase, D1, an admitted deployment or onchain activation.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifierFile = resolve(webRoot, 'output/playwright/v3-enrollment-verifier.mjs');
await build({ outfile: verifierFile, bundle: true, platform: 'node', format: 'esm', entryPoints: [resolve(webRoot, 'test/enrollment-verifier.ts')] });
const { verifyEnrollment, initializationFixture, prepareInitialization, authorizeInitialization, parseInitializationProof,
  prepareCreationOperation, authorizeCreationOperation, creationGasWire } = await import(pathToFileURL(verifierFile).href);
const creationPin = initializationFixture().pin;
const css = await readFile(resolve(webRoot, 'src/app/base.css'), 'utf8') + await readFile(resolve(webRoot, 'src/auth/auth.css'), 'utf8');
const result = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  stdin: { sourcefile: 'enrollment-harness.tsx', resolveDir: webRoot, loader: 'tsx', contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SecurityEnrollment from './src/wallet/SecurityEnrollment';
import { parseCredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import { parseInitializationHistory, parseInitializationRestoration } from '@gatopago/shared/v3/initialization-wire';
import { parseCreationPreview } from '@gatopago/shared/v3/creation-operation-wire';
let current = 'a', calls = 0, uncertain = false, inventoryFailure = false;
const listeners = new Set();
const runtime = {
  subscribe(callback) { listeners.add(callback); callback({ uid: current }); return () => listeners.delete(callback); },
  initializationProfile() { return ${JSON.stringify(creationPin)}; },
  async creationOperation(uid) {
    const assertCurrent = () => { if (uid !== current) throw { code: 'auth/session-changed' }; };
    assertCurrent();
    async function request(action, consent, body, signal) {
      assertCurrent(); calls++; document.getElementById('calls').textContent = String(calls);
      const id = consent.preparation.initialization_id;
      const response = await fetch('/fixture/creation/' + action, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, uncertain, id, ...body }) });
      assertCurrent(); const value = await response.json(); if (!response.ok) throw { code: value.code }; return value;
    }
    const review = (wire, consent) => ({ wire, preview: parseCreationPreview(wire, consent) });
    return { assertCurrent,
      async restore(consent, signal) {
        assertCurrent(); const response = await fetch('/fixture/creation/' + consent.preparation.initialization_id + '?uid=' + uid, { signal, cache: 'no-store' });
        assertCurrent(); const value = await response.json(); if (!response.ok) throw { code: value.code }; return review(value, consent);
      },
      async prepare(consent, cap, signal) { return review(await request('prepare', consent, { cap }, signal), consent); },
      async authorize(consent, view, proof, signal) { parseCreationPreview(view.wire, consent); return request('authorize', consent, { proof }, signal); },
    };
  },
  async initialization(uid) {
    const assertCurrent = () => { if (uid !== current) throw { code: 'auth/session-changed' }; };
    assertCurrent();
    async function request(action, body, signal) {
      assertCurrent(); calls++; document.getElementById('calls').textContent = String(calls);
      const response = await fetch('/fixture/initialization/' + action, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, uncertain, ...body }) });
      assertCurrent(); const value = await response.json(); if (!response.ok) throw { code: value.code }; return value;
    }
    async function read(action, signal) {
      assertCurrent();
      const response = await fetch('/fixture/initialization/' + action + (action.includes('?') ? '&' : '?') + 'uid=' + uid, { signal, cache: 'no-store' });
      assertCurrent(); const value = await response.json(); if (!response.ok) throw { code: value.code }; return value;
    }
    return { assertCurrent,
      async history(after, signal) { return parseInitializationHistory(await read('history' + (after ? '?after=' + encodeURIComponent(after) : ''), signal)); },
      async restore(item, signal) { return parseInitializationRestoration(await read('restore/' + item.initialization_id, signal), item,
        ${JSON.stringify(creationPin)}, { rpId: 'localhost', origin: 'http://localhost:4178' }); },
      async prepare(input, signal) { return { preparation: await request('prepare', input, signal), expected: {} }; },
      authorize: (consent, proof, signal) => request('authorize', { id: consent.preparation.initialization_id, proof }, signal) };
  },
  credentialInventory(uid) {
    const assertCurrent = () => { if (uid !== current) throw { code: 'auth/session-changed' }; };
    return { assertCurrent, async read(signal) {
      assertCurrent();
      const response = await fetch('/fixture/credentials?uid=' + uid + '&failure=' + inventoryFailure, { signal, cache: 'no-store' });
      assertCurrent();
      if (!response.ok) throw { code: 'credentials/unavailable' };
      return parseCredentialInventory(await response.json(), { rpId: 'localhost', origin: 'http://localhost:4178' });
    } };
  },
  enrollment(uid) {
    const assertCurrent = () => { if (uid !== current) throw { code: 'auth/session-changed' }; };
    async function request(action, body, signal) {
      assertCurrent(); calls++; document.getElementById('calls').textContent = String(calls);
      const response = await fetch('/fixture/' + action, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, uncertain, ...body }) });
      assertCurrent(); const value = await response.json();
      if (!response.ok) throw { code: value.code }; return value;
    }
    return { assertCurrent, prepare: (id, signal) => request('prepare', { id }, signal),
      complete: (id, submission, signal) => request('complete', { id, submission }, signal) };
  },
};
function Harness() {
  const [uid, setUid] = useState('a'); const [english, setEnglish] = useState(false);
  function switchUser() { current = current === 'a' ? 'b' : 'a'; listeners.forEach(callback => callback({ uid: current })); setUid(current); }
  return <main className="auth-shell"><h1>Seguridad V3 — prueba local</h1>
    <p>Identidad sintética: {uid}. Sin fondos.</p>
    <nav><button onClick={switchUser}>Cambiar usuario</button><button onClick={() => { uncertain = !uncertain; }}>Simular confirmación incierta</button><button onClick={() => { inventoryFailure = !inventoryFailure; }}>Simular error de lista</button><button onClick={() => setEnglish(value => !value)}>ES / EN</button></nav>
    <section className="auth-panel"><SecurityEnrollment key={uid} runtime={runtime} uid={uid} english={english} /></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const scope = { rpId: 'localhost', origin: 'http://localhost:4178' };
const attempts = new Map(), credentials = new Map(), initializations = new Map(), operations = new Map();
const stats = { prepared: 0, verified: 0, replayed: 0, rejected: 0, listed: 0, initializationPrepared: 0, initializationAuthorized: 0, initializationReplayed: 0,
  initializationListed: 0, initializationRestored: 0, creationPrepared: 0, creationAuthorized: 0, creationReplayed: 0, creationRead: 0 };
function operationView(operation) {
  const now = Math.floor(Date.now() / 1000);
  return { ...operation.wire, observed_at: now, receipt: { ...operation.wire.receipt, authorization_expired: now >= operation.wire.receipt.expires_at },
    lifecycle: { job_state: operation.wire.receipt.state === 'authorized' ? 'ready' : 'not_requested', reason: null,
      observation: null, bootstrap: null, account_readiness: 'not_assessed' } };
}
async function creationRequest(request, response) {
  let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw new Error('too-large'); }
  const { uid, id, cap, proof, uncertain } = JSON.parse(raw), initial = initializations.get(id);
  if (!['a', 'b'].includes(uid) || !initial || initial.uid !== uid || initial.receipt.state !== 'authorized') throw new Error('wrong-owner');
  let operation = operations.get(id);
  if (request.url === '/fixture/creation/prepare') {
    if (!operation) {
      // Synthetic fixture estimate. It never calls RPC, funds or broadcasts.
      const terms = { verificationGasLimit: 2_000_000n, callGasLimit: 100_000n, preVerificationGas: 150_000n,
        maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 0n, maximumGasCharge: BigInt(cap) };
      if (terms.maximumGasCharge < 2_250_000_000_000_000n) { response.writeHead(422); response.end(JSON.stringify({ code: 'creation/cap-too-low' })); return; }
      const candidate = prepareCreationOperation(initial.input, parseInitializationProof(JSON.parse(initial.proof)), terms, Math.floor(Date.now() / 1000));
      operation = { uid, terms, proof: null, wire: { observed_at: Math.floor(Date.now() / 1000), gas_terms: creationGasWire(terms),
        initial_assertion: JSON.parse(initial.proof), receipt: { initialization_id: id, state: 'prepared', user_op_hash: candidate.userOpHash,
          operation_digest: candidate.digest, expires_at: initial.input.validUntil, authorization_expired: false, delivery_state: 'not_requested',
          deployment_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false } } };
      operations.set(id, operation); stats.creationPrepared++;
      if (uncertain) { response.writeHead(503); response.end(JSON.stringify({ code: 'creation/unavailable' })); return; }
    }
    if (operation.uid !== uid || operation.terms.maximumGasCharge !== BigInt(cap)) throw new Error('conflict');
    response.end(JSON.stringify(operationView(operation))); return;
  }
  if (request.url !== '/fixture/creation/authorize' || !operation || operation.uid !== uid) throw new Error('wrong-owner');
  const exactProof = JSON.stringify(proof);
  if (operation.proof !== null) {
    if (operation.proof !== exactProof) throw new Error('conflict'); stats.creationReplayed++;
  } else {
    authorizeCreationOperation(initial.input, parseInitializationProof(JSON.parse(initial.proof)), operation.terms,
      parseInitializationProof(proof), Math.floor(Date.now() / 1000));
    operation.proof = exactProof; operation.wire.receipt.state = 'authorized'; operation.wire.receipt.delivery_state = 'pending'; stats.creationAuthorized++;
    if (uncertain) { response.writeHead(503); response.end(JSON.stringify({ code: 'creation/unavailable' })); return; }
  }
  response.end(JSON.stringify(operationView(operation).receipt));
}
async function initializationRequest(request, response) {
  let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw new Error('too-large'); }
  const body = JSON.parse(raw), { uid } = body;
  if (!['a', 'b'].includes(uid)) throw new Error('wrong-owner');
  if (request.url === '/fixture/initialization/prepare') {
    const key = credentials.get(body.credential_ref);
    if (!key || key.uid !== uid || !/^op_[0-9a-f-]{36}$/.test(body.request_id)) throw new Error('wrong-owner');
    let attempt = initializations.get(body.request_id);
    if (!attempt) {
      const now = Math.floor(Date.now() / 1000), input = { document: creationPin.document, expectedDigest: creationPin.digest, scope,
        publicKey: key.publicKey, userSaltCommitment: body.user_salt_commitment, validAfter: now, validUntil: now + 300 };
      const prepared = prepareInitialization(input);
      const receipt = { initialization_id: body.request_id, state: 'prepared', approval_digest: prepared.digest, profile_sha256: creationPin.digest,
        account_deployed: false, receive_enabled: false, spend_enabled: false };
      attempt = { uid, input, receipt, credentialRef: body.credential_ref, credentialId: key.credentialId, proof: null };
      initializations.set(body.request_id, attempt); stats.initializationPrepared++;
    }
    if (attempt.uid !== uid || attempt.credentialRef !== body.credential_ref || attempt.input.userSaltCommitment !== body.user_salt_commitment) throw new Error('conflict');
    response.end(JSON.stringify({ ...attempt.receipt, credential_ref: attempt.credentialRef, credential_id: attempt.credentialId,
      public_key: attempt.input.publicKey, valid_after: attempt.input.validAfter, valid_until: attempt.input.validUntil })); return;
  }
  const attempt = initializations.get(body.id);
  if (request.url !== '/fixture/initialization/authorize' || !attempt || attempt.uid !== uid) throw new Error('wrong-owner');
  const proof = JSON.stringify(body.proof);
  if (attempt.proof !== null) {
    if (attempt.proof !== proof) throw new Error('conflict'); stats.initializationReplayed++;
  } else {
    authorizeInitialization(attempt.input, parseInitializationProof(body.proof), Math.floor(Date.now() / 1000));
    attempt.proof = proof; attempt.receipt.state = 'authorized'; stats.initializationAuthorized++;
    if (body.uncertain) { response.writeHead(503); response.end(JSON.stringify({ code: 'initialization/unavailable' })); return; }
  }
  response.end(JSON.stringify(attempt.receipt));
}
async function fixture(request, response) {
  let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 24576) throw new Error('too-large'); }
  const { uid, id, submission, uncertain } = JSON.parse(raw);
  if (!['a', 'b'].includes(uid) || !/^op_[0-9a-f-]{36}$/.test(id)) throw new Error('invalid-fixture');
  let attempt = attempts.get(id);
  if (request.url === '/fixture/prepare') {
    if (!attempt) {
      attempt = { uid, scope, challenge: '0x' + randomBytes(32).toString('hex'), proofChallenge: '0x' + randomBytes(32).toString('hex'), validUntilMs: Date.now() + 300000 };
      attempts.set(id, attempt); stats.prepared++;
    }
    if (attempt.uid !== uid) throw new Error('wrong-owner');
    return response.end(JSON.stringify({ kind: 'prepared', id, scope, challenge: attempt.challenge, proofChallenge: attempt.proofChallenge,
      validUntilMs: attempt.validUntilMs, userHandle: createHash('sha256').update(uid).digest('base64url'), userName: 'GatoPago 12345678',
      excludeCredentials: Array.from(credentials.values()).filter(value => value.uid === uid).map(value => value.credentialId) }));
  }
  if (request.url !== '/fixture/complete' || !attempt || attempt.uid !== uid) throw new Error('wrong-owner');
  const verified = await verifyEnrollment(submission, attempt);
  const previous = credentials.get(id);
  if (previous) {
    if (previous.responseHash !== verified.responseHash) throw new Error('conflict');
    stats.replayed++;
  } else {
    if (Date.now() >= attempt.validUntilMs || Array.from(credentials.values()).some(value => value.credentialId === verified.credentialId)) throw new Error('conflict');
    credentials.set(id, { uid, ...verified, createdAt: Math.floor(Date.now() / 1000) }); stats.verified++;
    if (uncertain) { response.writeHead(503); response.end(JSON.stringify({ code: 'enrollment/unavailable' })); return; }
  }
  response.end(JSON.stringify({ kind: 'enrolled', id }));
}
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url === '/stats' && request.method === 'GET') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(stats)); return; }
  if (request.url?.startsWith('/fixture/creation/') && request.method === 'GET') {
    const url = new URL(request.url, scope.origin), uid = url.searchParams.get('uid'), operation = operations.get(url.pathname.split('/')[3]);
    response.setHeader('Content-Type', 'application/json'); stats.creationRead++;
    if (!['a', 'b'].includes(uid) || !operation || operation.uid !== uid) {
      response.writeHead(404); response.end(JSON.stringify({ code: 'creation/not-found' })); return;
    }
    response.end(JSON.stringify(operationView(operation))); return;
  }
  if (request.url?.startsWith('/fixture/initialization/') && request.method === 'GET') {
    const url = new URL(request.url, scope.origin), uid = url.searchParams.get('uid');
    response.setHeader('Content-Type', 'application/json');
    if (!['a', 'b'].includes(uid)) { response.writeHead(400); response.end('{}'); return; }
    const now = Math.floor(Date.now() / 1000);
    if (url.pathname === '/fixture/initialization/history') {
      stats.initializationListed++;
      let data = Array.from(initializations.entries()).filter(([, a]) => a.uid === uid).map(([id, a]) => ({
        initialization_id: id, credential_ref: a.credentialRef, profile_sha256: creationPin.digest, approval_digest: a.receipt.approval_digest,
        created_at: a.input.validAfter, expires_at: a.input.validUntil,
        state: a.receipt.state === 'authorized' ? 'authorized' : a.input.validUntil <= now ? 'expired' : 'prepared', creation_operation_recorded: operations.has(id),
      })).sort((a, b) => b.created_at - a.created_at || b.initialization_id.localeCompare(a.initialization_id));
      const after = url.searchParams.get('after');
      if (after) {
        const [, time, id] = after.split(':');
        data = data.filter((row) => row.created_at < Number(time) || (row.created_at === Number(time) && row.initialization_id < id));
      }
      const last = data[9];
      response.end(JSON.stringify({ observed_at: now, data: data.slice(0, 10), next_cursor: data.length > 10 ? 'v1:' + last.created_at + ':' + last.initialization_id : null })); return;
    }
    const id = url.pathname.split('/')[4], attempt = initializations.get(id);
    if (url.pathname.startsWith('/fixture/initialization/restore/') && attempt?.uid === uid) {
      stats.initializationRestored++;
      response.end(JSON.stringify({ preparation: { ...attempt.receipt, credential_ref: attempt.credentialRef, credential_id: attempt.credentialId,
        public_key: attempt.input.publicKey, valid_after: attempt.input.validAfter, valid_until: attempt.input.validUntil },
      user_salt_commitment: attempt.input.userSaltCommitment, creation_operation_recorded: operations.has(id) })); return;
    }
    response.writeHead(404); response.end('{}'); return;
  }
  if (request.url?.startsWith('/fixture/credentials?') && request.method === 'GET') {
    const url = new URL(request.url, scope.origin), uid = url.searchParams.get('uid');
    response.setHeader('Content-Type', 'application/json');
    if (!['a', 'b'].includes(uid)) { response.writeHead(400); response.end('{}'); return; }
    stats.listed++;
    if (url.searchParams.get('failure') === 'true') { response.writeHead(503); response.end('{}'); return; }
    const data = Array.from(credentials.entries()).filter(([, value]) => value.uid === uid).map(([id, value]) => ({
      credential_ref: id, created_at: value.createdAt, transports: value.transports, aaguid: value.aaguid,
      backup_eligible: value.backupEligible, backed_up_at_registration: value.backedUp,
    }));
    response.end(JSON.stringify({ scope, data, device_availability: 'unknown', onchain_authority: 'not_assessed' })); return;
  }
  if (request.url?.startsWith('/fixture/') && request.method === 'POST') {
    response.setHeader('Content-Type', 'application/json');
    const isInitialization = request.url.startsWith('/fixture/initialization/'), isCreation = request.url.startsWith('/fixture/creation/');
    void (isCreation ? creationRequest : isInitialization ? initializationRequest : fixture)(request, response).catch(() => {
      stats.rejected++; response.writeHead(400); response.end(JSON.stringify({ code: isCreation ? 'creation/invalid' : isInitialization ? 'initialization/invalid' : 'enrollment/invalid' }));
    }); return;
  }
  if (request.url === '/harness.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(result.outputFiles[0].text); return; }
  if (request.url !== '/') { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V3 enrollment local acceptance</title>
    <style>body{margin:0;background:#fff8ef;font-family:system-ui}nav{display:flex;gap:8px;flex-wrap:wrap}button{padding:10px}${css}</style>
    <div id="root"></div><p>Solicitudes de prueba: <span id="calls">0</span></p><script src="/harness.js"></script></html>`);
});
server.listen(4178, '127.0.0.1', () => process.stdout.write('Local enrollment harness: http://localhost:4178 (synthetic identity, real cryptographic verification)\n'));
