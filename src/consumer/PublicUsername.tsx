'use client';

import { useEffect, useRef, useState } from 'react';
import type { Environment } from '@gatopago/environment';
import type { BrowserAuth } from '../auth/browser';
import { profileMessage, resolveUsername, type Profile, type Recipient } from '../wallet/profile';
import { creationFeeUnit } from '../wallet/creation-fee';
import { ConsumerFrame } from './ConsumerFrame';
import { BackHeader, Field, Panel } from './Primitives';
import { localizedPath } from './routes';

type Lookup = (username: string, network: string, signal: AbortSignal) => Promise<Recipient>;
function RecipientLookup({ username, networks, lookup, english: en }: { username: string; networks: readonly string[]; lookup: Lookup; english: boolean }) {
  const [network, setNetwork] = useState(networks.length === 1 ? networks[0] : ''), [recipient, setRecipient] = useState<Recipient | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [expired, setExpired] = useState(false), [copied, setCopied] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => {
    if (!recipient) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, recipient.expires_at * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [recipient]);
  async function read() {
    if (active.current || !networks.includes(network)) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setRecipient(null); setCopied(false);
    try {
      const value = await lookup(username, network, controller.signal);
      if (!controller.signal.aborted) { setRecipient(value); setExpired(false); }
    } catch (failure) { if (!controller.signal.aborted) setError(profileMessage(failure, en)); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <Panel><h2 className="font-display text-xl">@{username}</h2>
    {!networks.length ? <p>{en ? 'Receiving is not enabled in this environment.' : 'La recepción no está habilitada en este ambiente.'}</p> : <>
      <Field label={en ? 'Network' : 'Red'}>{id => <select id={id} value={network} disabled={busy} onChange={event => {
        setNetwork(event.target.value); setRecipient(null); setError(''); setCopied(false);
      }}><option value="">{en ? 'Choose a network' : 'Elige una red'}</option>{networks.map(id => <option key={id} value={id}>{creationFeeUnit(id)?.network ?? id}</option>)}</select>}</Field>
      <button className="auth-primary btn btn-primary btn-block" disabled={busy || !network} onClick={() => void read()}>{busy ? en ? 'Verifying…' : 'Verificando…' : en ? 'Verify recipient' : 'Verificar destinatario'}</button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
    {recipient && !expired ? <>
      <p className="my-3">{recipient.display_name}</p><p>{creationFeeUnit(recipient.network_id)?.network ?? recipient.network_id}</p>
      <p className="my-3 break-all font-mono text-sm">{recipient.address}</p>
      <button className="auth-secondary btn btn-ghost btn-block" onClick={() => {
        if (Date.now() >= recipient.expires_at * 1000) { setExpired(true); return; }
        if (!navigator.clipboard?.writeText) { setError(en ? 'Select the address to copy it.' : 'Selecciona la dirección para copiarla.'); return; }
        void navigator.clipboard.writeText(recipient.address).then(() => setCopied(true)).catch(() => setError(en ? 'Copy failed. Select the address manually.' : 'No se pudo copiar. Selecciona la dirección manualmente.'));
      }}>{copied ? en ? 'Copied' : 'Copiado' : en ? 'Copy address' : 'Copiar dirección'}</button>
      <a className="auth-primary btn btn-primary btn-block" href={localizedPath(`/send?username=${recipient.username}&chain=${recipient.network_id.split(':')[1]}`, en)} onClick={event => {
        if (Date.now() >= recipient.expires_at * 1000) { event.preventDefault(); setExpired(true); }
      }}>{en ? 'Review a transfer in GatoPago' : 'Revisar un envío en GatoPago'}</a>
      <p>{en ? 'Check the network and address before sending. Opening this page does not make a payment.' : 'Comprueba la red y dirección antes de enviar. Abrir esta página no realiza un pago.'}</p>
    </> : null}
    {recipient && expired ? <p role="status">{en ? 'Verification expired. Verify again before using the receiving address.' : 'La verificación venció. Verifica de nuevo antes de usar la dirección receptora.'}</p> : null}
  </Panel>;
}

export function PublicUsername({ username, environment, english: en }: { username: string; environment: Environment; english: boolean }) {
  return <ConsumerFrame english={en}><div className="auth-content">
    <BackHeader title={en ? 'Public receiving profile' : 'Perfil público para recibir'} english={en} to={en ? '/en' : '/'} />
    <RecipientLookup key={username} username={username} networks={environment.status === 'provisioned' ? environment.wallet_enabled : []}
      lookup={(name, network, signal) => resolveUsername(environment, name, network, signal)} english={en} />
    <a className="auth-secondary btn btn-ghost btn-block" href={localizedPath('/login', en)}>{en ? 'Sign in to my account' : 'Entrar a mi cuenta'}</a>
  </div></ConsumerFrame>;
}

export function ReceiveProfile({ runtime, uid, english: en }: { runtime: BrowserAuth; uid: string; english: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let unsubscribe: (() => void) | undefined;
    void (async () => {
      const client = runtime.profile(uid);
      unsubscribe = runtime.subscribe(identity => {
        try { if (identity?.uid !== uid) throw new Error('Changed'); client.assertCurrent(); }
        catch { controller.abort(); setProfile(null); setError(en ? 'Your session changed.' : 'Tu sesión cambió.'); }
      });
      const value = await client.read(controller.signal); if (!controller.signal.aborted) setProfile(value);
    })().catch(failure => { if (!controller.signal.aborted) setError(profileMessage(failure, en)); });
    return () => { controller.abort(); unsubscribe?.(); };
  }, [runtime, uid, en]);
  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p role="status">{en ? 'Loading profile…' : 'Cargando perfil…'}</p>;
  if (!profile.username_published_at || !profile.username) return <Panel>
    <p>{en ? 'Activate your wallet and publish your username to receive.' : 'Activa tu wallet y publica tu username para recibir.'}</p>
    <a className="auth-primary btn btn-primary btn-block" href={localizedPath('/profile', en)}>{en ? 'Set up receiving' : 'Configurar recepción'}</a>
  </Panel>;
  return <>
    <a className="auth-secondary btn btn-ghost btn-block" href={localizedPath(`/@${profile.username}`, en)}>{en ? 'My public receiving page' : 'Mi página pública para recibir'}</a>
    <RecipientLookup key={profile.username} username={profile.username} networks={runtime.recipientNetworks()}
      lookup={(name, network, signal) => runtime.recipient(uid, name, network, signal)} english={en} />
  </>;
}
