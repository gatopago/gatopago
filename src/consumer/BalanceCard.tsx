'use client';

import { useId, useState } from 'react';
import { atomicToDecimal } from '@gatopago/shared/v3/amount';
import type { BalanceView } from '../wallet/balances';
import { EyeIcon } from './Icons';

/** Home's original visual hierarchy; V3 observed balances are never labelled spendable. */
export function BalanceCard({ balance, network, english: en }: { balance: BalanceView | null; network: string; english: boolean }) {
  const heading = useId();
  const [hidden, setHidden] = useState(false);
  const [assetId, setAssetId] = useState('');
  const asset = balance?.assets.find(item => item.asset_id === assetId) ?? balance?.assets[0];
  return <section aria-labelledby={heading} className="meli-balance-card-app my-5 p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={heading} className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{en ? 'Onchain balance' : 'Saldo en red'}</h2>
      <button type="button" onClick={() => setHidden(value => !value)} aria-pressed={hidden}
        aria-label={hidden ? (en ? 'Show balance' : 'Mostrar saldo') : (en ? 'Hide balance' : 'Ocultar saldo')}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"><EyeIcon hidden={hidden} /></button>
    </div>
    <p className="type-mono break-all text-[42px] font-bold leading-none tracking-[-0.06em] min-[390px]:text-[46px]">
      {asset?.symbol === 'USDC' && !hidden ? <span className="mr-1 align-top text-[23px] text-text-muted">$</span> : null}
      {hidden ? '••••' : asset ? atomicToDecimal(asset.amount_atomic, asset.decimals) : '—'}
    </p>
    <p className="mt-2 text-[11px] text-text-faint">{asset?.symbol ?? '—'} · {network}</p>
    {balance && balance.assets.length > 1 ? <label className="mt-4 block text-[12px]">
      {en ? 'Asset' : 'Activo'}
      <select className="mt-2 min-h-11 w-full border border-border bg-surface p-2 text-text" value={asset?.asset_id ?? ''} onChange={event => setAssetId(event.target.value)}>
        {balance.assets.map(item => <option key={item.asset_id} value={item.asset_id}>{item.symbol}</option>)}
      </select>
    </label> : null}
    {!balance ? <p className="mt-4 text-[12px] text-text-muted">{en ? 'We could not check your balance. This does not mean your balance is zero.' : 'No pudimos consultar el saldo. Esto no significa que tu saldo sea cero.'}</p> : <details className="mt-4 text-[12px] text-text-muted">
      <summary className="cursor-pointer py-2">{en ? 'Balance details' : 'Detalles del saldo'}</summary>
      <p>{en ? 'Finalized block' : 'Bloque finalizado'}: {balance.block_number}</p>
      <p>{en ? 'Observed at' : 'Observado el'} <time dateTime={new Date(balance.observed_at * 1000).toISOString()}>{new Date(balance.observed_at * 1000).toISOString()}</time></p>
      {asset ? <p className="break-all">{asset.asset_id}</p> : null}
    </details>}
  </section>;
}
