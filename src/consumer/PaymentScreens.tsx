'use client';

import type { BrowserAuth } from '../auth/browser';
import { ReceiveProfile } from './PublicUsername';
import { useState } from 'react';
import AmountInput from './AmountInput';
import { BackHeader, Field, IntegrationNotice, Panel, UnavailableAction } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { MeliSprite } from '../marketing/MeliSprite';

const field = 'meli-field h-12 w-full px-3 text-[14px]';

/** UI retained from CreateLink; issuing a link belongs to Flow, not Next. */
export function ChargeScreen({ english: en }: { english: boolean }) {
  const [amount, setAmount] = useState(''), [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  return <><BackHeader title={en ? 'Request money' : 'Cobrar'} english={en} to="/move?flow=receive" />
    <IntegrationNotice english={en} />
    <form onSubmit={event => event.preventDefault()}>
      <Panel><p className="meli-kicker mb-5">{en ? 'How much do you want to receive?' : '¿Cuánto quieres recibir?'}</p>
        <Field label={en ? 'Amount in USDC' : 'Monto en USDC'}>{id => <AmountInput id={id} value={amount} onChange={setAmount} disabled={open} placeholder="0.00" maxLength={40} className="w-full bg-transparent font-display text-[48px]" />}</Field>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={open} onChange={event => setOpen(event.target.checked)} />{en ? 'Let the payer choose the amount' : 'Dejar que el pagador elija el monto'}</label>
        <Field label={en ? 'Reference (optional)' : 'Referencia (opcional)'}>{id => <textarea id={id} value={reference} onChange={event => setReference(event.target.value)} maxLength={140} rows={3} className="meli-field mt-3 w-full p-3" />}</Field>
        <UnavailableAction>{en ? 'Create payment link' : 'Crear enlace de cobro'}</UnavailableAction>
      </Panel>
    </form><p className="text-sm text-text-muted">{en ? 'Once a link is issued, you can share its QR or URL. No link has been created.' : 'Cuando se emita un enlace podrás compartir su QR o URL. Todavía no se creó ningún enlace.'}</p>
  </>;
}

export function ReceiveScreen({ english: en, runtime, uid }: { english: boolean; runtime?: BrowserAuth; uid?: string }) {
  if (runtime && uid) return <><BackHeader title={en ? 'Receive in my account' : 'Recibir en mi cuenta'} english={en} to="/move?flow=receive" /><ReceiveProfile key={uid} runtime={runtime} uid={uid} english={en} /></>;
  return <><BackHeader title={en ? 'Receive in my account' : 'Recibir en mi cuenta'} english={en} to="/move?flow=receive" />
    <p className="mb-6 text-text-muted">{en ? 'Share your verified account address or QR to receive from a wallet or exchange.' : 'Comparte el QR o dirección verificada de tu cuenta para recibir desde una wallet o exchange.'}</p>
    <Panel><Field label={en ? 'Network' : 'Red'}>{id => <select id={id} className={field} disabled><option>Arbitrum Sepolia</option></select>}</Field>
      <MeliSprite variant="body-courier" className="mx-auto mb-5 w-28" />
      <IntegrationNotice english={en} />
      <p className="text-sm">{en ? 'A receiving address is shown only after V3 validates the account and its receiving capability. Do not deposit into an old account.' : 'La dirección se muestra únicamente después de validar la cuenta V3 y su capacidad de recepción. No deposites en una cuenta anterior.'}</p>
      <UnavailableAction>{en ? 'Copy receiving address' : 'Copiar dirección de recepción'}</UnavailableAction>
    </Panel><NavigationLink href={localizedPath('/charge', en)} className="btn btn-ghost btn-block">{en ? 'Request with a payment link' : 'Cobrar con un enlace'}</NavigationLink>
  </>;
}

export function SwapScreen({ english: en }: { english: boolean }) {
  const [amount, setAmount] = useState(''), [from, setFrom] = useState('USDC'), [to, setTo] = useState('ETH');
  const [slippage, setSlippage] = useState('0.5');
  return <><BackHeader title={en ? 'Swap' : 'Cambiar'} english={en} to="/move" /><IntegrationNotice english={en} />
    <form onSubmit={event => event.preventDefault()}><Panel>
      <Field label={en ? 'You pay' : 'Entregas'}>{id => <select id={id} className={field} value={from} onChange={event => setFrom(event.target.value)}><option>USDC</option><option>ETH</option></select>}</Field>
      <Field label={en ? 'Amount' : 'Monto'}>{id => <AmountInput id={id} value={amount} onChange={setAmount} placeholder="0.00" maxLength={40} className="w-full bg-transparent font-display text-[40px]" />}</Field>
      <button type="button" className="btn btn-ghost mx-auto mb-5 flex" aria-label={en ? 'Reverse assets' : 'Invertir activos'} onClick={() => { setFrom(to); setTo(from); setAmount(''); }}>⇅</button>
      <Field label={en ? 'You receive' : 'Recibes'}>{id => <select id={id} className={field} value={to} onChange={event => setTo(event.target.value)}><option>ETH</option><option>USDC</option></select>}</Field>
      <p className="mb-5 font-display text-[32px]" aria-label={en ? 'Quote unavailable' : 'Cotización no disponible'}>—</p>
      <fieldset><legend className="mb-2 text-sm">{en ? 'Maximum slippage' : 'Deslizamiento máximo'}</legend><div className="flex gap-2">{['0.1', '0.5', '1'].map(value => <button key={value} type="button" aria-pressed={slippage === value} className={`btn btn-sm ${slippage === value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSlippage(value)}>{value}%</button>)}</div></fieldset>
      {from === to ? <p role="status" className="mt-3 text-sm">{en ? 'Choose two different assets.' : 'Elige dos activos distintos.'}</p> : null}
      <UnavailableAction>{en ? 'Review swap' : 'Revisar cambio'}</UnavailableAction>
    </Panel></form><p className="text-sm text-text-muted">{en ? 'No price, rate or fee is estimated without a verified quote.' : 'No se estima precio, tasa ni comisión sin una cotización verificada.'}</p>
  </>;
}

export function CrosschainScreen({ english: en }: { english: boolean }) {
  const [address, setAddress] = useState(''), [amount, setAmount] = useState('');
  return <><BackHeader title={en ? 'Send to another network' : 'Enviar a otra red'} english={en} to="/move" /><IntegrationNotice english={en} />
    <Panel><Field label={en ? 'Source' : 'Origen'}>{id => <select id={id} className={field} disabled><option>Arbitrum Sepolia · USDC</option></select>}</Field>
      <Field label={en ? 'Destination network' : 'Red de destino'}>{id => <select id={id} className={field} disabled><option>{en ? 'No V3 route enabled' : 'Sin ruta V3 habilitada'}</option></select>}</Field>
      <Field label={en ? 'Recipient address' : 'Dirección del destinatario'}>{id => <input id={id} value={address} onChange={event => setAddress(event.target.value)} autoComplete="off" spellCheck={false} maxLength={42} className={field} />}</Field>
      <Field label={en ? 'Amount in USDC' : 'Monto en USDC'}>{id => <AmountInput id={id} value={amount} onChange={setAmount} placeholder="0.00" maxLength={40} className={field} />}</Field>
      <dl className="space-y-3 border-t border-border pt-4 text-sm"><div className="flex justify-between"><dt>{en ? 'Cost' : 'Costo'}</dt><dd>—</dd></div><div className="flex justify-between"><dt>{en ? 'Estimated time' : 'Tiempo estimado'}</dt><dd>—</dd></div></dl>
      <UnavailableAction>{en ? 'Review route' : 'Revisar ruta'}</UnavailableAction>
    </Panel></>;
}

export function EarnScreen({ english: en }: { english: boolean }) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit'), [amount, setAmount] = useState('');
  return <><BackHeader title={en ? 'Grow' : 'Crecer'} english={en} />
    <div className="mb-6 flex items-center gap-5"><MeliSprite variant="body-courier" className="w-24" /><p className="text-sm text-text-muted">{en ? 'Review the risks before putting your digital dollars to work.' : 'Revisa los riesgos antes de poner a trabajar tus dólares digitales.'}</p></div>
    <IntegrationNotice english={en} /><Panel><dl className="grid grid-cols-2 gap-4"><div><dt className="text-sm text-text-muted">{en ? 'Position' : 'Posición'}</dt><dd className="mt-2 font-display text-3xl">—</dd></div><div><dt className="text-sm text-text-muted">APY</dt><dd className="mt-2 font-display text-3xl">—</dd></div></dl></Panel>
    <Panel><div className="mb-5 grid grid-cols-2 gap-2" role="group" aria-label={en ? 'Operation' : 'Operación'}>{(['deposit', 'withdraw'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => { setTab(value); setAmount(''); }} className={`btn ${tab === value ? 'btn-primary' : 'btn-ghost'}`}>{value === 'deposit' ? en ? 'Deposit' : 'Depositar' : en ? 'Withdraw' : 'Retirar'}</button>)}</div>
      <Field label={en ? 'USDC amount' : 'Monto USDC'}>{id => <AmountInput id={id} value={amount} onChange={setAmount} placeholder="0.00" maxLength={40} className={field} />}</Field>
      <UnavailableAction>{en ? 'Review operation' : 'Revisar operación'}</UnavailableAction>
    </Panel><p className="text-sm text-text-muted">{en ? 'Returns are not guaranteed. Smart contract, liquidity and market risks apply. No position is being opened.' : 'El rendimiento no está garantizado. Existen riesgos de contrato, liquidez y mercado. No se está abriendo ninguna posición.'}</p></>;
}
