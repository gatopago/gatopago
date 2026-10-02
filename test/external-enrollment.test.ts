import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashTypedData } from 'viem';
import { externalEnrollmentRequest, importExternalEnrollment } from '@gatopago/shared/v3/external-enrollment';
import { authorizeBackupEnrollment, prepareBackupEnrollment } from '@gatopago/shared/v3/backup-enrollment';
import { backupWireFixture } from './backup.fixture';

function fixture() {
  const t = backupWireFixture(), index = t.compiled.enrollments.find((p) => t.compiled.nextPolicy.signers[p.signerIndex].kind === 0)!.signerIndex;
  const key = t.f.keys.find((key) => key.address.toLowerCase() === t.compiled.nextPolicy.signers[index].key)!;
  const now = t.f.input.validAfter, request = externalEnrollmentRequest(t.choice, t.wire, index, now);
  const typedData = request.typedData;
  const response = (signature: string) => JSON.stringify({ schema_version: 1, purpose: 'gatopago-v3-enrollment-proof',
    backup_id: t.choice.backupId, signer_index: index, digest: request.summary.digest, signature });
  return { ...t, index, key, now, request, typedData, response };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Public EIP-712 external enrollment transport', () => {
  it('uses exactly the contract enrollment digest, with no tokens, credential IDs, keys or external I/O', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); const t = fixture(), encoded = JSON.parse(t.request.json);
    expect(hashTypedData(t.typedData)).toBe(t.request.summary.digest);
    expect(encoded).toMatchObject({ schema_version: 1, backup_id: t.choice.backupId, signer_index: t.index,
      signer_address: t.key.address.toLowerCase(), proposal_hash: t.compiled.digest, policy: t.compiled.nextPolicy,
      typed_data: { primaryType: 'EnrollmentProof', domain: { name: 'GatoPago Account', version: '3.0-consumer', chainId: t.f.initial.chainId.toString(), verifyingContract: t.f.initial.account },
        message: { nonce: t.compiled.message.nonce.toString(), securityVersion: '1', nextPolicyHash: t.compiled.message.nextPolicyHash, contextHash: t.compiled.digest } } });
    expect(Object.keys(encoded.typed_data.types).sort()).toEqual(['EIP712Domain', 'EnrollmentProof']);
    expect(t.request.json).not.toContain(t.choice.consent.preparation.credential_id);
    expect(t.request.json).not.toMatch(/firebase|private_key|secret|credential_ref|credential_id|token|https:\/\//i);
    expect(fetchMock).not.toHaveBeenCalled(); expect(Object.isFrozen(t.request.typedData.domain)).toBe(true);
    expect(Object.isFrozen(t.request.typedData.message)).toBe(true); expect(Object.isFrozen(t.request.typedData.types.EnrollmentProof[0])).toBe(true);
  });
  it('accepts a real external typed signature and composes it with the owner and other factors for the existing compiler', async () => {
    const t = fixture(), signature = await t.key.signTypedData(t.typedData);
    const proof = await importExternalEnrollment(t.choice, t.wire, t.index, t.response(signature), t.now);
    expect(proof).toEqual({ kind: 'ecdsa', signerIndex: t.index, signature }); expect(Object.isFrozen(proof)).toBe(true);
    const proofs = (await t.f.proofs()).map((p) => p.signerIndex === t.index ? proof : p);
    const authorization = await authorizeBackupEnrollment(t.f.input, t.f.assertion(t.compiled.digest), proofs, t.now);
    expect(authorization.proposalHash).toBe(t.request.summary.proposal_hash);
    expect(authorization.account_readiness).toBe('not_assessed');
  });
  it('preserves EIP-712 semantics through JSON stringification without rounding nonce/securityVersion', () => {
    const t = fixture(), input = structuredClone(t.f.input), nonce = ((1n << 180n) + 73n).toString();
    input.observation.security.nonces.admin = nonce;
    const compiled = prepareBackupEnrollment(input, t.now), wire = { ...t.wire, input, proposal_hash: compiled.digest };
    const request = externalEnrollmentRequest(t.choice, wire, t.index, t.now), encoded = JSON.parse(request.json);
    expect(encoded.typed_data.message.nonce).toBe(nonce); expect(encoded.typed_data.message.securityVersion).toBe('1');
    expect(hashTypedData(encoded.typed_data)).toBe(request.summary.digest);
  });
  it.each(['future', 'expired', 'authorized', 'state-expired', 'fractional', 'nan', 'wrong-index', 'passkey-index'])('rejects %s fresh proof requests', (change) => {
    const t = fixture(), wire = structuredClone(t.wire); let now = t.now, index = t.index;
    if (change === 'future') now--;
    if (change === 'expired') now = t.f.input.validUntil;
    if (change === 'authorized') Object.assign(wire, { state: 'authorized' });
    if (change === 'state-expired') Object.assign(wire, { state: 'expired' });
    if (change === 'fractional') now += 0.1;
    if (change === 'nan') now = NaN;
    if (change === 'wrong-index') index = 16;
    if (change === 'passkey-index') index = t.compiled.nextPolicy.signers.findIndex((p) => p.kind === 1);
    expect(() => externalEnrollmentRequest(t.choice, wire, index, now)).toThrow();
  });
  it.each(['altered-policy', 'altered-scope', 'altered-account', 'altered-digest', 'altered-window', 'altered-proposal', 'wrong-pin'])('reconstructs and rejects %s response material', (change) => {
    const t = fixture(), wire = structuredClone(t.wire), choice = structuredClone(t.choice);
    if (change === 'altered-policy') wire.input.nextPolicy.adminThreshold++;
    if (change === 'altered-scope') wire.input.initialization.scope.origin = 'https://untrusted.example';
    if (change === 'altered-account') wire.input.observation.account = t.f.keys[0].address;
    if (change === 'altered-digest') wire.proposal_hash = `0x${'00'.repeat(32)}`;
    if (change === 'altered-window') wire.valid_until++;
    if (change === 'altered-proposal') Object.assign(wire.input, { proposalValidUntil: wire.input.proposalValidUntil + 1 });
    if (change === 'wrong-pin') choice.consent.expected.document += ' ';
    expect(() => externalEnrollmentRequest(choice, wire, t.index, t.now)).toThrow();
  });
  it.each(['wrong-key', 'personal-sign', 'different-request', 'high-s', 'zero-s', 'v-0', 'short', 'uppercase'])('rejects %s signatures without a fallback transport', async (change) => {
    const t = fixture(); let signature: string = await t.key.signTypedData(t.typedData);
    if (change === 'wrong-key') signature = await t.f.keys.find((key) => key.address !== t.key.address)!.signTypedData(t.typedData);
    if (change === 'personal-sign') signature = await t.key.signMessage({ message: { raw: t.request.summary.digest } });
    if (change === 'different-request') signature = await t.key.signTypedData({ ...t.typedData, message: { ...t.typedData.message, nonce: t.typedData.message.nonce + 1n } });
    if (change === 'high-s') signature = signature.slice(0, 66) + 'f'.repeat(64) + signature.slice(-2);
    if (change === 'zero-s') signature = signature.slice(0, 66) + '0'.repeat(64) + signature.slice(-2);
    if (change === 'v-0') signature = signature.slice(0, -2) + '00';
    if (change === 'short') signature = signature.slice(0, -2);
    if (change === 'uppercase') signature = `0x${signature.slice(2).toUpperCase()}`;
    await expect(importExternalEnrollment(t.choice, t.wire, t.index, t.response(signature), t.now)).rejects.toThrow();
  });
  it.each(['digest', 'index', 'backup', 'version', 'purpose', 'extra-key', 'missing', 'array', 'invalid-json', 'oversize'])('rejects %s proof envelopes', async (change) => {
    const t = fixture(), raw = JSON.parse(t.response(await t.key.signTypedData(t.typedData)));
    if (change === 'digest') raw.digest = `0x${'0'.repeat(64)}`;
    if (change === 'index') raw.signer_index++;
    if (change === 'backup') raw.backup_id = backupWireFixture().choice.backupId;
    if (change === 'version') raw.schema_version = 2;
    if (change === 'purpose') raw.purpose = 'pay';
    if (change === 'extra-key') raw.private_key = 'do-not-import';
    if (change === 'missing') delete raw.purpose;
    const text = change === 'array' ? JSON.stringify([raw]) : change === 'invalid-json' ? '{' :
      change === 'oversize' ? ' '.repeat(1025) + JSON.stringify(raw) : JSON.stringify(raw);
    await expect(importExternalEnrollment(t.choice, t.wire, t.index, text, t.now)).rejects.toThrow();
  });
  it('does not mutate a detached request when the caller edits the source policy', () => {
    const t = fixture(), saved = t.request.json; t.choice.nextPolicy.adminThreshold++;
    expect(t.request.json).toBe(saved); expect(hashTypedData(t.typedData)).toBe(t.request.summary.digest);
  });
});
