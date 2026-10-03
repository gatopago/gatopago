'use client';

import dynamic from 'next/dynamic';
import { useId, useState, useSyncExternalStore } from 'react';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';
import { TransferEntry } from './TransferEntry';
import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice, BalanceView } from './balances';
import type { parseTransferStatus } from './transfers';
import { moneyBookmarkSnapshot, moneyBookmarkServerSnapshot, moneyStoredSnapshot, moneyStoredServerSnapshot, parseMoneyBookmark, subscribeMoneyBookmark } from './money-bookmark';
const Money = dynamic(() => import('./WalletMoney').then(m => m.WalletMoney));

export function WalletFundingEntry(props: { runtime: BrowserAuth; uid: string; account: AccountChoice; balance: BalanceView | null;
  english: boolean; onReconciled?: (status: ReturnType<typeof parseTransferStatus>) => void }) {
  const [source,setSource] = useState<'available' | 'aave'>('available'), input = useId();
  const busy = useSyncExternalStore(subscribeReloadGuard,isReloadBlocked,serverReloadBlocked), en = props.english;
  const hash = useSyncExternalStore(subscribeMoneyBookmark,moneyBookmarkSnapshot,moneyBookmarkServerSnapshot);
  const stored = useSyncExternalStore(subscribeMoneyBookmark,() => {
    try { return moneyStoredSnapshot({ wallet_id: props.account.wallet_id,wallet_account_id: props.account.id }); } catch { return 'invalid'; }
  },moneyStoredServerSnapshot);
  let saved = null;
  try { saved = parseMoneyBookmark(hash); } catch { /* Invalid bookmarks remain blocked by the operation screen. */ }
  const retained = stored !== '[]';
  const effectiveSource = retained || (saved?.wallet_id === props.account.wallet_id && saved.wallet_account_id === props.account.id) ? 'aave' : source;
  return <>
    {props.account.network_id === 'eip155:421614' ? <fieldset className="money-source" disabled={busy}><legend>{en ? 'Where to send from' : 'Desde dónde enviar'}</legend>
      <label><input type="radio" name={input} checked={effectiveSource === 'available'} disabled={!!saved || retained} onChange={() => { if (!isReloadBlocked()) setSource('available'); }} />{en ? 'Account balance' : 'Disponible en cuenta'}</label>
      <label><input type="radio" name={input} checked={effectiveSource === 'aave'} onChange={() => { if (!isReloadBlocked()) setSource('aave'); }} />{en ? 'Aave position' : 'Posición Aave'}</label></fieldset> : null}
    {effectiveSource === 'aave' ? <Money runtime={props.runtime} uid={props.uid} account={props.account} english={en} mode="pay" /> : <TransferEntry {...props} />}
  </>;
}
