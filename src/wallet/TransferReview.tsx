'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { SignerKind } from '@gatopago/shared/v3/security-policy';
import type { TransferRequest } from '@gatopago/shared/v3/transfer';
import type { BrowserAuth } from '../auth/browser';
import type { EnabledAuthConfig } from '../auth/config';
import { parseTransferPreparation, type TransferSelection } from './transfer-preparation';
import type { TransferReview as Review } from './transfer-command';
import { TransferExecutionFlow } from './transfer-execution-flow';
import { TransferSigning } from './transfer-signing';
import { requestPasskeyProof } from './passkeys';
import { creationFeeUnit } from './creation-fee';
import { formatTransferAsset, validateTransferAssets, type TransferAsset } from './transfer-form';
import { TransferReceipt } from './TransferReceipt';
import { parseRecipient, type Recipient } from './profile';
import type { parseTransferStatus } from './transfers';
import { saveTransferBookmark, clearTransferBookmark } from './transfer-bookmark';
import { NavigationLink } from '../consumer/NavigationLink';

type Props = {
  runtime: Pick<BrowserAuth, 'transferCommands' | 'transfers' | 'subscribe'>; uid: string; selected: TransferSelection; request: TransferRequest; review: Review;
  recipient?: Recipient | null; environment: EnabledAuthConfig['deployment']; credentials: readonly CredentialDetail[]; metadata: readonly TransferAsset[]; english: boolean; onEdit?: () => void;
  onReconciled?: (status: ReturnType<typeof parseTransferStatus>) => void
};

/** Automatically reset all reviewed state if identity, account or consent changes. */
export function TransferReview(props: Props) {
  return <ReviewedTransfer key={JSON.stringify([props.uid, props.environment, props.selected, props.request, props.review.wire, props.credentials, props.metadata, props.recipient])} {...props} />;
}

function ReviewedTransfer({ runtime, uid, selected, request, review, environment, credentials, metadata, english: en, onEdit, recipient, onReconciled }: Props) {
  const [bound] = useState(() => {
    const preparation = parseTransferPreparation(review.wire, selected, request, environment);
    const destination = recipient ? parseRecipient(recipient, recipient.username, request.network_id, recipient.verified_at) : null;
    if (destination && destination.address !== request.destination.address) throw new Error('Recipient does not match the reviewed address');
    const expiresAt = Math.min(preparation.expires_at, destination?.expires_at ?? preparation.expires_at);
    const commands = runtime.transferCommands(uid), transfers = runtime.transfers(uid);
    const assertCurrent = () => { commands.assertCurrent(); transfers.assertCurrent(); };
    const bookmark = { wallet_id: selected.wallet_id, wallet_account_id: selected.wallet_account_id, network_id: selected.network_id,
      consent_digest: preparation.candidate.digest, expires_at: preparation.expires_at };
    return {
      preparation, recipient: destination, expiresAt, assertCurrent, bookmark,
      flow: new TransferExecutionFlow(() => ({ commands, transfers }), selected, request, review, environment, () => saveTransferBookmark(bookmark)),
      signing: new TransferSigning(preparation, credentials, () => {
        assertCurrent(); if (Date.now() >= expiresAt * 1000) throw new Error('Recipient or transfer review expired');
      }, requestPasskeyProof)
    };
  });
  const state = useSyncExternalStore(bound.flow.subscribe, bound.flow.snapshot, bound.flow.snapshot);
  const [signed, setSigned] = useState<number[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [expired, setExpired] = useState(false), [external, setExternal] = useState<Record<number, string>>({});
  const inFlight = useRef(false), mounted = useRef(true), heading = useId();
  useEffect(() => {
    mounted.current = true;
    const close = () => { bound.signing.dispose(); bound.flow.invalidate(); };
    const unsubscribe = runtime.subscribe(identity => {
      try { if (identity?.uid !== uid) throw new Error('Session changed'); bound.assertCurrent(); } catch { close(); }
    });
    const timer = setTimeout(() => { setExpired(true); bound.signing.dispose(); }, Math.max(0, bound.expiresAt * 1000 - Date.now()));
    return () => {
      mounted.current = false; clearTimeout(timer); unsubscribe();
      // React Strict Mode replays setup/cleanup without unmounting the instance.
      // Invalidate on actual detachment; synchronous mount tracking already
      // prevents late UI updates. No action here can submit or create a proof.
      queueMicrotask(() => { if (!mounted.current) close(); });
    };
  }, [bound, runtime, uid]);
  useEffect(() => {
    if (!bound.flow.canTrack()) return;
    // Only read an already identified operation. Never sign, confirm, deliver,
    // or recover an uncertain confirmation from a background effect.
    const read = () => { if (document.visibilityState === 'visible') void bound.flow.readStatus(); };
    const timer = window.setTimeout(read, 5_000);
    document.addEventListener('visibilitychange', read);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', read); };
  }, [bound, state]);
  useEffect(() => {
    if (state.status?.status === 'reconciled') onReconciled?.(state.status);
  }, [state.status, onReconciled]);
  function run(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(false);
    // Invoke immediately in the click stack: no await before the passkey prompt.
    void action().then(() => { if (mounted.current) setSigned(bound.signing.signedIndices()); })
      .catch(() => { if (mounted.current) setError(true); })
      .finally(() => { inFlight.current = false; if (mounted.current) setBusy(false); });
  }
  const p = bound.preparation, c = p.candidate, policy = p.review.policy, native = creationFeeUnit(request.network_id);
  const editable = !expired && !busy && ['ready', 'confirmation-uncertain'].includes(state.phase);
  const assets = validateTransferAssets(metadata, request.network_id);
  const amount = formatTransferAsset(c.funding.amount_atomic, request.asset_id, assets);
  const gas = formatTransferAsset(p.review.context.budget.maximum_native_gas_atomic, p.review.context.native_asset_id, assets);
  if (state.phase === 'closed') return <p role="alert">{en ? 'Your session changed. Reopen this transfer.' : 'Tu sesión cambió. Vuelve a abrir este envío.'}</p>;
  return <section aria-labelledby={heading} aria-busy={busy}>
    <h3 id={heading}>{en ? 'Review transfer' : 'Revisar envío'}</h3>
    <dl>{bound.recipient ? <><dt>{en ? 'Username' : 'Nombre de usuario'}</dt><dd>@{bound.recipient.username} · {bound.recipient.display_name}</dd></> : null}<dt>{en ? 'Recipient' : 'Destino'}</dt><dd style={{ overflowWrap: 'anywhere' }}>{request.destination.address}</dd>
      <dt>{en ? 'Amount' : 'Importe'}</dt><dd>{amount}{request.amount.kind === 'max' ? ' (MAX)' : ''}</dd>
      <dt>{en ? 'Network' : 'Red'}</dt><dd>{native?.network ?? request.network_id}</dd>
      <dt>{en ? 'Maximum network cost' : 'Coste máximo de red'}</dt><dd>{p.review.context.sponsorship ? (en ? 'Covered by GatoPago' : 'Cubierto por GatoPago') : gas}</dd>
      <dt>{en ? 'Platform fee' : 'Comisión de plataforma'}</dt><dd>{formatTransferAsset(p.review.context.budget.platform_fee.amount_atomic, request.asset_id, assets)}</dd></dl>
    <details><summary>{en ? 'Technical details' : 'Detalles técnicos'}</summary>
      <p style={{ overflowWrap: 'anywhere' }}>{request.asset_id}</p><code style={{ overflowWrap: 'anywhere' }}>{c.digest}</code>
      <p>{en ? 'No private key or recovery phrase is needed.' : 'No necesitas introducir una clave privada ni frase de recuperación.'}</p></details>
    <p>{en ? 'Signatures' : 'Firmas'}: {signed.length}/{policy.spendThreshold}</p>
    {bound.signing.choices().map(choice => <div key={choice.index}>
      <h4>{en ? 'Signing key' : 'Llave de firma'} {choice.index + 1} {signed.includes(choice.index) ? '✓' : ''}</h4>
      {choice.kind === SignerKind.WEBAUTHN ? choice.credential_refs.length ? choice.credential_refs.map(ref =>
        <button key={ref} type="button" className="auth-secondary btn btn-ghost btn-block" disabled={!editable || signed.includes(choice.index)} onClick={() => run(() => bound.signing.passkey(choice.index, ref))}>
          {en ? 'Sign with passkey' : 'Firmar con passkey'} · {ref.slice(-8)}</button>)
        : <p>{en ? 'No registered credential matches this key.' : 'No hay una credencial registrada que corresponda a esta llave.'} <NavigationLink href="/settings/security">{en ? 'Open security' : 'Ir a Seguridad'}</NavigationLink></p>
        : choice.kind === SignerKind.ECDSA ? <details><summary>{en ? 'External signature' : 'Firma externa'}</summary>
          <p style={{ overflowWrap: 'anywhere' }}>{choice.key}</p>
          <label>{en ? 'Signature of this exact digest (not personal_sign)' : 'Firma de este digest exacto (no personal_sign)'}
            <input value={external[choice.index] ?? ''} maxLength={132} autoComplete="off" spellCheck={false} disabled={!editable}
              onChange={event => setExternal(previous => ({ ...previous, [choice.index]: event.target.value }))} /></label>
          <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={!editable || signed.includes(choice.index)} onClick={() => run(async () => {
            await bound.signing.external(choice.index, external[choice.index] ?? '');
            if (mounted.current) setExternal(previous => ({ ...previous, [choice.index]: '' }));
          })}>{en ? 'Verify signature' : 'Verificar firma'}</button></details> : <p>{en ? 'Unsupported signing transport.' : 'Transporte de firma no disponible.'}</p>}
    </div>)}
    {error || state.error ? <p role="alert">{en ? 'The action could not be verified. Do not assume a submitted transfer failed.' : 'No se pudo verificar la acción. No supongas que un envío presentado falló.'}</p> : null}
    {expired ? <p role="status">{bound.flow.canEdit()
      ? (en ? 'This review expired. Edit and review again to obtain current costs.' : 'Esta revisión venció. Vuelve a editar y revisar para obtener los costes actuales.')
      : (en ? 'This review expired. Do not repeat the transfer while its result is unknown.' : 'Esta revisión venció. No repitas el envío mientras su resultado sea desconocido.')}</p> : null}
    {onEdit && bound.flow.canEdit() ? <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => {
      if (inFlight.current || !bound.flow.discardUnsubmitted()) return;
      bound.signing.dispose(); onEdit();
    }}>{en ? 'Edit transfer' : 'Editar envío'}</button> : null}
    <button type="button" className="auth-primary btn btn-primary btn-block" disabled={!editable || signed.length < policy.spendThreshold} onClick={() => run(async () => {
      const proofs = await bound.signing.confirmationProofs(); await bound.flow.confirm(proofs);
    })}>{en ? 'Confirm reviewed transfer' : 'Confirmar el envío revisado'}</button>
    {state.phase === 'reserved' ? <button type="button" className="auth-primary btn btn-primary btn-block" disabled={busy || expired} onClick={() => run(() => bound.flow.deliver())}>{en ? 'Send now' : 'Enviar ahora'}</button> : null}
    {state.confirmation || state.phase === 'confirmation-uncertain' ? <>
      {state.confirmation ? <p style={{ overflowWrap: 'anywhere' }}>{en ? 'Reference' : 'Referencia'}: {state.confirmation.id}</p> : null}
      <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => run(() => bound.flow.readStatus())}>
        {state.confirmation ? (en ? 'Check transfer' : 'Consultar envío') : (en ? 'Check transfer status' : 'Consultar estado del envío')}
      </button></> : null}
    {state.delivery && !state.status ? <p role="status">{en ? 'Delivery recorded; final confirmation is pending.' : 'Entrega registrada; falta la confirmación final.'}</p> : null}
    {bound.flow.canTrack() ? <p role="status">{en ? 'We are checking this same transfer while this screen is visible.' : 'Estamos consultando este mismo envío mientras esta pantalla está visible.'}</p> : null}
    {state.status ? <TransferReceipt english={en} request={request} selected={selected} status={state.status}
      amountAtomic={c.funding.amount_atomic} metadata={metadata} onClose={onEdit ? () => {
        if (!state.status || state.status.funds_reserved || !['reconciled','expired'].includes(state.status.status)) return;
        bound.assertCurrent(); clearTransferBookmark(bound.bookmark); onEdit();
      } : undefined} /> : null}
  </section>;
}
