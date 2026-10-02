'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { reviewedRecipient } from '../consumer/qr';
import type { CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import type { BrowserAuth } from '../auth/browser';
import type { EnabledAuthConfig } from '../auth/config';
import type { BalanceView } from './balances';
import type { TransferSelection } from './transfer-preparation';
import { transferAssets, transferFormRequest } from './transfer-form';
import { TransferReview } from './TransferReview';
import { normalizeUsername, parseRecipient, type Recipient } from './profile';

type Props = { runtime:BrowserAuth; uid:string; selected:TransferSelection; balance:BalanceView;
  environment:EnabledAuthConfig['deployment']; english:boolean };
export function TransferForm(props:Props) {
  const params = useSearchParams();
  const username = params?.get('username'), chain = params?.get('chain');
  const handle = username && /^[a-z][a-z0-9_]{4,29}$/.test(username) && (!chain || `eip155:${chain}` === props.selected.network_id) ? `@${username}` : '';
  const recipient = reviewedRecipient(params, props.selected.network_id) || handle;
  return <OwnedTransferForm key={JSON.stringify([props.uid,props.environment,props.selected,props.balance,recipient])} {...props} recipient={recipient}/>;
}
function OwnedTransferForm({ runtime,uid,selected,balance,environment,english:en,recipient }:Props & { recipient: string }) {
  const [metadata] = useState(() => transferAssets(balance,selected));
  const [asset,setAsset] = useState(metadata[0].asset_id), [destination,setDestination] = useState(recipient);
  const [amount,setAmount] = useState(''), [max,setMax] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(false);
  const [closed,setClosed] = useState(false);
  const [prepared,setPrepared] = useState<{ request:ReturnType<typeof transferFormRequest>;
    review:Awaited<ReturnType<ReturnType<BrowserAuth['transferPreparations']>['prepare']>>; credentials:CredentialDetail[]; recipient:Recipient|null } | null>(null);
  const active = useRef<AbortController|null>(null), form = useId();
  useEffect(() => {
    let live = true;
    const close = () => { active.current?.abort(); active.current = null; setPrepared(null); setClosed(true); setBusy(false); };
    let session:ReturnType<BrowserAuth['transferPreparations']>;
    try { session = runtime.transferPreparations(uid); }
    catch {
      // Identity may change between render and effect. Do not throw through the
      // React tree, and do not update an instance detached by StrictMode replay.
      queueMicrotask(() => { if (live) close(); });
      return () => { live = false; };
    }
    const unsubscribe = runtime.subscribe(identity => {
      try { if (identity?.uid !== uid) throw new Error('Changed'); session.assertCurrent(); }
      catch { if (live) close(); }
    });
    return () => { live = false; unsubscribe(); active.current?.abort(); active.current = null; };
  },[runtime,uid]);
  const change = () => { active.current?.abort(); active.current = null; setBusy(false); setError(false); setPrepared(null); };
  async function prepare() {
    if (active.current || prepared || closed) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(false);
    try {
      const username = destination.startsWith('0x') ? null : normalizeUsername(destination);
      let request = username ? null : transferFormRequest(selected,metadata,{ asset_id:asset,destination,amount,max });
      const credentialsSession = runtime.credentialInventory(uid), transfers = runtime.transferPreparations(uid);
      const inventory = await credentialsSession.read(controller.signal), credentials:CredentialDetail[] = [];
      // Bounded batches; complete public credential discovery before starting
      // the short economic review window. This never prompts an authenticator.
      for (let offset=0; offset<inventory.data.length; offset+=4) {
        controller.signal.throwIfAborted();
        credentials.push(...await Promise.all(inventory.data.slice(offset,offset+4).map(c => credentialsSession.detail(c.credential_ref,controller.signal))));
      }
      const recipient = username ? await runtime.recipient(uid, username, selected.network_id, controller.signal) : null;
      request ??= transferFormRequest(selected,metadata,{ asset_id:asset,destination:recipient!.address,amount,max });
      const review = await transfers.prepare(selected,request,controller.signal);
      if (recipient) parseRecipient(recipient, recipient.username, selected.network_id);
      if (controller.signal.aborted || active.current !== controller) return;
      credentialsSession.assertCurrent(); transfers.assertCurrent(); setPrepared({ request,review,credentials,recipient });
    } catch { if (!controller.signal.aborted && active.current === controller) setError(true); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  if (closed) return <p role="alert">{en ? 'Your session changed. Reopen this account.' : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}</p>;
  if (prepared) return <TransferReview runtime={runtime} uid={uid} selected={selected} request={prepared.request}
    review={prepared.review} metadata={metadata} environment={environment} credentials={prepared.credentials} recipient={prepared.recipient} english={en} onEdit={change}/>;
  return <section aria-labelledby={`${form}-heading`} aria-busy={busy}>
    <h3 id={`${form}-heading`}>{en ? 'Send' : 'Enviar'}</h3>
    <form onSubmit={event => { event.preventDefault(); void prepare(); }}>
      <label htmlFor={`${form}-asset`}>{en ? 'Asset' : 'Activo'}</label>
      <select id={`${form}-asset`} value={asset} onChange={event => { change(); setAsset(event.target.value); setAmount(''); }}>
        {metadata.map(a => <option key={a.asset_id} value={a.asset_id}>{a.symbol} · {a.asset_id.split('/')[1]}</option>)}</select>
      <label htmlFor={`${form}-destination`}>{en ? 'Address or @username' : 'Dirección o @username'}</label>
      <input id={`${form}-destination`} autoComplete="off" spellCheck={false} maxLength={42} value={destination}
        onChange={event => { change(); setDestination(event.target.value); }} required/>
      <label htmlFor={`${form}-amount`}>{en ? 'Amount' : 'Importe'}</label>
      <input id={`${form}-amount`} inputMode="decimal" autoComplete="off" maxLength={335} value={amount} disabled={max}
        onChange={event => { change(); setAmount(event.target.value); }} required={!max}/>
      <label><input type="checkbox" checked={max} onChange={event => { change(); setMax(event.target.checked); }}/>{en ? 'Use maximum available (MAX)' : 'Usar máximo disponible (MAX)'}</label>
      <p>{en ? 'MAX is calculated after reserved funds and bounded costs. Preparing does not send funds.'
        : 'MAX se calcula descontando reservas y costes acotados. Preparar no envía fondos.'}</p>
      {error ? <p role="alert">{en ? 'Check the destination and amount. We could not prepare this transfer.' : 'Revisa el destino y el importe. No pudimos preparar este envío.'}</p> : null}
      <button className="auth-primary btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? (en ? 'Preparing…' : 'Preparando…') : (en ? 'Review transfer' : 'Revisar envío')}</button>
    </form>
  </section>;
}
