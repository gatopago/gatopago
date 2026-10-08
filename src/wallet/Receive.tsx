'use client';

import { useEffect, useState } from 'react';
import { faucetCall, walletAssets } from '@gatopago/shared/assets';
import { walletNetwork } from '@gatopago/shared/networks';
import { AddressQRCard } from '../consumer/AddressQRCard';
import { BackHeader, MoneyPanel, NoticeCard } from '../consumer/Primitives';
import { SelectMenu } from '../consumer/SelectMenu';
import { TokenSelect } from '../consumer/TokenSelect';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { refreshBalances } from './balances';
import { failureMessage } from './messages';
import { send } from './operations';
import type { Session } from './session';
import { stellarAccount } from './stellar';

/**
 * `/receive`, as in V2: coin, QR and the warnings a wallet or exchange needs. The coin comes first:
 * each one lives on its own network (AVAX on Avalanche…), so choosing it chooses the network. Only
 * USDC can arrive on several, so it alone asks which one: the home network comes chosen, and
 * Stellar shows its own address when it is on. On testnets, a coin with a faucet can be requested.
 */
export function Receive({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const [symbol, setSymbol] = useState('USDC');
  const [usdcNetwork, setUsdcNetwork] = useState(settings.homeNetwork);
  const [requested, setRequested] = useState<'busy' | 'done' | string | null>(null);
  // Stellar receives USDC at the account's own Stellar address, from Wallet Core.
  const [stellar, setStellar] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    stellarAccount(settings, session)
      .then((account) => {
        if (active) setStellar(account?.account ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settings, session]);
  const stellarId = stellar ? settings.stellar!.network : null;
  // XLM, when Stellar is on, lives only there: it is received at the Stellar account, like USDC on
  // Stellar.
  const coins = walletAssets(settings.networks, settings.stellar?.network);
  const coin = coins.find((item) => item.symbol === symbol) ?? coins[0];
  const usdc = coin.symbol === 'USDC';
  const held = usdc
    ? (coin.holdings.find(({ networkId }) => networkId === usdcNetwork) ?? coin.holdings[0])
    : coin.holdings[0];
  const onStellar =
    (usdc && usdcNetwork === stellarId) || held.networkId === settings.stellar?.network;
  const networkId = onStellar ? settings.stellar!.network : held.networkId;
  const network = networkName(networkId);
  const chainId = onStellar ? undefined : walletNetwork(networkId).chain.id;
  const faucet = !onStellar && walletNetwork(networkId).chain.testnet ? held.faucet : undefined;

  function requestTestCoins() {
    if (!faucet) return;
    setRequested('busy');
    send(settings, session, networkId, [faucetCall(faucet, session.wallet.address)])
      .then(() => {
        setRequested('done');
        void refreshBalances(settings, session.wallet.address);
      })
      .catch((failure: unknown) => setRequested(failureMessage(failure, en)));
  }

  return (
    <>
      <BackHeader title={en ? 'Receive' : 'Recibir'} english={en} to="/move?flow=receive" />
      <p className="mb-5 text-[14px] leading-relaxed text-text-muted">
        {en
          ? 'Choose the coin, then share your address with the wallet or exchange that sends it.'
          : 'Elige la moneda y comparte tu dirección con la wallet o el exchange que te la envía.'}
      </p>
      <div className="mb-5 flex items-center gap-2">
        <TokenSelect
          value={coin.symbol}
          label={en ? 'Currency' : 'Moneda'}
          options={coins.map((item) => ({
            value: item.symbol,
            symbol: item.symbol,
            label: item.symbol === 'USDC' ? item.name : networkName(item.holdings[0].networkId),
          }))}
          onChange={(value) => {
            setSymbol(value);
            setRequested(null);
          }}
          english={en}
        />
        {usdc ? (
          <SelectMenu
            label={en ? 'Network' : 'Red'}
            showLabel={false}
            value={onStellar ? stellarId! : held.networkId}
            options={[...settings.networks, ...(stellarId ? [stellarId] : [])].map((id) => ({
              value: id,
              label: networkName(id),
              description:
                id === settings.homeNetwork
                  ? en
                    ? 'Recommended: your main network'
                    : 'Recomendada: tu red principal'
                  : undefined,
              tone: 'info' as const,
            }))}
            onChange={(id) => {
              setUsdcNetwork(id);
              setRequested(null);
            }}
            english={en}
            className="min-w-0 flex-1"
          />
        ) : (
          <p className="min-w-0 flex-1 truncate px-1 text-[14px] text-text-muted">
            {en ? `On ${network}` : `Por ${network}`}
          </p>
        )}
      </div>
      <MoneyPanel className="mb-4">
        {onStellar && !stellar ? (
          <p className="py-8 text-center text-[13px] text-text-muted">
            {en ? 'Preparing your Stellar address…' : 'Preparando tu dirección de Stellar…'}
          </p>
        ) : (
          <AddressQRCard
            address={onStellar ? stellar! : session.wallet.address}
            chainId={chainId}
            english={en}
          />
        )}
      </MoneyPanel>
      <NoticeCard
        tone="warning"
        title={
          en
            ? `Only ${coin.symbol}, only on ${network}`
            : `Solo ${coin.symbol} y solo por ${network}`
        }
      >
        {onStellar
          ? en
            ? 'This address (C…) is your Stellar smart account. Send from a Stellar wallet that accepts contract addresses; most exchanges do not yet.'
            : 'Esta dirección (C…) es tu cuenta inteligente en Stellar. Envía desde una wallet de Stellar que acepte direcciones de contrato; la mayoría de los exchanges todavía no.'
          : en
            ? `In the exchange or wallet that sends it, choose ${coin.symbol} and the same network you see here, ${network}. On another network, the money can be lost.`
            : `En el exchange o la wallet que te lo envía, elige ${coin.symbol} y la misma red que ves aquí, ${network}. Por otra red, el dinero puede perderse.`}
      </NoticeCard>
      {faucet ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={requested === 'busy'}
            onClick={requestTestCoins}
          >
            {requested === 'busy'
              ? en
                ? 'Requesting…'
                : 'Pidiendo…'
              : en
                ? `Get test ${coin.symbol}`
                : `Recibir ${coin.symbol} de prueba`}
          </button>
          {requested && requested !== 'busy' ? (
            <p
              role={requested === 'done' ? 'status' : 'alert'}
              className="mt-2 text-center text-[12px] text-text-muted"
            >
              {requested === 'done'
                ? en
                  ? `Your test ${coin.symbol} arrived.`
                  : `Llegaron tus ${coin.symbol} de prueba.`
                : requested}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
