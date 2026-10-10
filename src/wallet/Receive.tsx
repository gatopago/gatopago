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
import { useFailureMessage } from './messages';
import { send } from './operations';
import type { Session } from './session';
import { stellarAccount } from './stellar';
import { useTranslations } from 'next-intl';
import { NetworkIcon } from '../consumer/TokenIcon';

/**
 * `/receive`, as in V2: coin, QR and the warnings a wallet or exchange needs. The coin comes first:
 * each one lives on its own network (AVAX on Avalanche…), so choosing it chooses the network. Only
 * USDC can arrive on several, so it alone asks which one: the home network comes chosen, and
 * Stellar shows its own address when it is on. On testnets, a coin with a faucet can be requested.
 */
export function Receive({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const t = useTranslations('Receive');
  const [symbol, setSymbol] = useState('USDC');
  const [usdcNetwork, setUsdcNetwork] = useState(settings.homeNetwork);
  const [requested, setRequested] = useState<'busy' | 'done' | string | null>(null);
  // Stellar receives at the account's own Stellar address, from Wallet Core: `undefined` while
  // asking, `null` when Stellar is off. A failed request says so and can be retried; it never
  // stays "preparing" nor removes Stellar from the choices.
  const [stellar, setStellar] = useState<string | null>();
  const [stellarFailed, setStellarFailed] = useState(false);
  const [stellarTry, setStellarTry] = useState(0);
  useEffect(() => {
    let active = true;
    stellarAccount(settings, session)
      .then((account) => {
        if (active) setStellar(account?.account ?? null);
      })
      .catch(() => {
        if (active) setStellarFailed(true);
      });
    return () => {
      active = false;
    };
  }, [settings, session, stellarTry]);
  const stellarId = settings.stellar && stellar !== null ? settings.stellar.network : null;
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
      .catch((failure: unknown) => setRequested(messageFor(failure)));
  }

  return (
    <>
      <BackHeader title={t('receive')} to="/move?flow=receive" />
      <p className="mb-5 text-[14px] leading-relaxed text-text-muted">{t('chooseCoinThenShare')}</p>
      {/* The coin, then its network on a row of its own: the same layout for every coin. */}
      <div className="mb-5 flex flex-col items-start gap-2">
        <TokenSelect
          value={coin.symbol}
          label={t('currency')}
          options={coins.map((item) => ({
            value: item.symbol,
            symbol: item.symbol,
            label: item.symbol === 'USDC' ? item.name : networkName(item.holdings[0].networkId),
          }))}
          onChange={(value) => {
            setSymbol(value);
            setRequested(null);
          }}
        />
        {usdc ? (
          <SelectMenu
            label={t('network')}
            showLabel={false}
            value={onStellar ? stellarId! : held.networkId}
            options={[...settings.networks, ...(stellarId ? [stellarId] : [])].map((id) => ({
              value: id,
              label: networkName(id),
              description: id === settings.homeNetwork ? t('recommendedMainNetwork') : undefined,
              network: id,
            }))}
            onChange={(id) => {
              setUsdcNetwork(id);
              setRequested(null);
            }}
            className="w-full"
          />
        ) : (
          // A coin of one network: the same row as USDC's choice, with nothing to choose.
          <p className="flex h-12 w-full items-center gap-2 border border-border px-3.5 text-[14px] text-text-muted">
            <NetworkIcon id={networkId} size={22} />
            <span className="truncate">{t('on', { network })}</span>
          </p>
        )}
      </div>
      <MoneyPanel className="mb-4">
        {onStellar && !stellar ? (
          stellarFailed ? (
            <p role="alert" className="py-8 text-center text-[13px] leading-relaxed text-pending">
              {t('couldNotGetStellar')}{' '}
              <button
                type="button"
                onClick={() => {
                  setStellarFailed(false);
                  setStellarTry((current) => current + 1);
                }}
                className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
              >
                {t('tryAgain')}
              </button>
            </p>
          ) : (
            <p className="py-8 text-center text-[13px] text-text-muted">
              {t('preparingStellarAddress')}
            </p>
          )
        ) : (
          <AddressQRCard
            address={onStellar ? stellar! : session.wallet.address}
            chainId={chainId}
          />
        )}
      </MoneyPanel>
      <NoticeCard tone="warning" title={t('onlyOnly', { symbol: coin.symbol, network })}>
        {onStellar
          ? t('addressCStellarSmart')
          : t('exchangeWalletSendsChoose', { symbol: coin.symbol, network })}
      </NoticeCard>
      {faucet ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={requested === 'busy'}
            onClick={requestTestCoins}
          >
            {requested === 'busy' ? t('requesting') : t('getTest', { symbol: coin.symbol })}
          </button>
          {requested && requested !== 'busy' ? (
            <p
              role={requested === 'done' ? 'status' : 'alert'}
              className="mt-2 text-center text-[12px] text-text-muted"
            >
              {requested === 'done' ? t('testArrived', { symbol: coin.symbol }) : requested}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
