import { parseCredentialDetail, type CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { parseInitializationProof } from '@gatopago/shared/v3/initialization-wire';
import { Role, SignerKind } from '@gatopago/shared/v3/security-policy';
import { verifyTransferProof, verifyTransferQuorum } from '@gatopago/shared/v3/transfer-authorization';
import type { parseTransferPreparation } from './transfer-preparation';
import type { TransferProofs } from './transfer-command';
import type { requestPasskeyProof } from './passkeys';

type Preparation = ReturnType<typeof parseTransferPreparation>;
/** Instance-local proof collection. A saved credential is only a candidate for
 * a ceremony, never evidence that the device can use it. No storage or network. */
export class TransferSigning {
  private readonly preparation: Preparation;
  private readonly credentials: CredentialDetail[];
  private readonly proofs = new Map<number,TransferProofs[number]>();
  private active: AbortController | null = null;
  private closed = false;
  constructor(preparation: Preparation, credentials: readonly CredentialDetail[], private readonly assertCurrent: () => void,
    private readonly prove: typeof requestPasskeyProof) {
    this.preparation = structuredClone(preparation);
    if (credentials.length > 16) throw new Error('Invalid credential list');
    this.credentials = credentials.map(c => parseCredentialDetail(c,this.preparation.review.scope,c.credential_ref));
    if (new Set(this.credentials.map(c => c.credential_ref)).size !== credentials.length) throw new Error('Duplicate credential');
  }
  private live() {
    this.assertCurrent(); const now = Math.floor(Date.now()/1000);
    if (this.closed || now < this.preparation.review.prepared_at || now >= this.preparation.expires_at) throw new Error('Signing unavailable');
  }
  choices() {
    return this.preparation.review.policy.signers.flatMap((member,index) => {
      if ((member.roles & Role.SPEND) === 0) return [];
      return [{ index,kind:member.kind,key:member.key,credential_refs: member.kind === SignerKind.WEBAUTHN
        ? this.credentials.filter(c => c.public_key === member.key).map(c => c.credential_ref) : [] }];
    });
  }
  signedIndices() { return [...this.proofs.keys()].sort((a,b) => a-b); }
  dispose() { this.closed = true; this.active?.abort(); this.active = null; this.proofs.clear(); }
  async passkey(index: number, reference: string) {
    this.live(); if (this.active || this.proofs.has(index)) return;
    const choice = this.choices().find(c => c.index === index), credential = this.credentials.find(c => c.credential_ref === reference);
    if (!choice || choice.kind !== SignerKind.WEBAUTHN || !choice.credential_refs.includes(reference as CredentialDetail['credential_ref']) || !credential) throw new Error('Wrong credential');
    const controller = new AbortController(); this.active = controller;
    try {
      // Synchronous invocation retains Safari user activation. No imports, token
      // refresh or preparation fetch can occur before this call.
      const wire = await this.prove({ scope:this.preparation.review.scope,key:credential.public_key,
        credentialId:credential.credential_id,challenge:this.preparation.candidate.digest,
        validUntilMs:this.preparation.expires_at*1000,signal:controller.signal });
      this.live(); controller.signal.throwIfAborted();
      const proof = { signerIndex:index,kind:'webauthn' as const,assertion:parseInitializationProof(wire) };
      await this.keep(proof,controller);
    } finally { if (this.active === controller) this.active = null; }
  }
  async external(index: number, signature: string) {
    this.live(); if (this.active || this.proofs.has(index)) return;
    if (!/^0x[0-9a-f]{128}(1b|1c)$(?![\s\S])/.test(signature)) throw new Error('Invalid signature');
    const controller = new AbortController(); this.active = controller;
    try { await this.keep({ signerIndex:index,kind:'ecdsa',signature:signature as `0x${string}` },controller); }
    finally { if (this.active === controller) this.active = null; }
  }
  private async keep(proof: TransferProofs[number], controller: AbortController) {
    const p = this.preparation;
    await verifyTransferProof(p.candidate.digest,p.review.policy,p.review.scope,proof);
    this.live(); controller.signal.throwIfAborted();
    this.proofs.set(proof.signerIndex,structuredClone(proof));
  }
  async confirmationProofs() {
    this.live(); if (this.active) throw new Error('Signing pending');
    const p = this.preparation, proofs = structuredClone([...this.proofs.values()]);
    await verifyTransferQuorum(p.candidate.digest,p.review.policy,p.review.scope,proofs);
    this.live(); return proofs;
  }
}
