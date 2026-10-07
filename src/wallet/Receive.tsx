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
import { useAdvanced } from './preferences';
import type { Session } from './session';
import { stellarAccount } from './stellar';

/**
 * `/receive`, as in V2: coin, QR and the warnings a wallet or exchange needs. The simple view
 * chooses a coin and receives on the network that holds it (the home network for USDC); the
 * advanced one picks the network first. On testnets, a coin with a faucet (AUSD) can be requested.
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
  const advanced = useAdvanced();
  const [chosenNetwork, setNetworkId] = useState(settings.homeNetwork);
  const [symbol, setSymbol] = useState('USDC');
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
  const stellarId = advanced && stellar ? settings.stellar!.network : null;
  if (chosenNetwork === stellarId)
    return (
      <>
        <BackHeader title={en ? 'Receive' : 'Recibir'} english={en} to="/move?flow=receive" />
        <div className="mb-5 flex items-center gap-2">
          <SelectMenu
            label={en ? 'Network' : 'Red'}
            showLabel={false}
            value={chosenNetwork}
            options={networkOptions()}
            onChange={setNetworkId}
            english={en}
            className="min-w-0 flex-1"
          />
        </div>
        <MoneyPanel className="mb-4">
          <AddressQRCard address={stellar!} english={en} />
        </MoneyPanel>
        <NoticeCard
          tone="warning"
          title={
            en
              ? `Only USDC, only on ${networkName(chosenNetwork)}`
              : `Solo USDC y solo por ${networkName(chosenNetwork)}`
          }
        >
          {en
            ? 'This address (C…) is your Stellar smart account. Send from a Stellar wallet that accepts contract addresses; most exchanges do not yet.'
            : 'Esta dirección (C…) es tu cuenta inteligente en Stellar. Envía desde una wallet de Stellar que acepte direcciones de contrato; la mayoría de los exchanges todavía no.'}
        </NoticeCard>
      </>
    );
  const coins = walletAssets(advanced ? [chosenNetwork] : settings.networks);
  const coin = coins.find((item) => item.symbol === symbol) ?? coins[0];
  const held = advanced
    ? coin.holdings[0]
    : (coin.holdings.find(({ networkId }) => networkId === settings.homeNetwork) ??
      coin.holdings[0]);
  const networkId = held.networkId;
  const { chain } = walletNetwork(networkId);
  const network = networkName(networkId);
  const faucet = chain.testnet ? held.faucet : undefined;

  function networkOptions() {
    return [...settings.networks, ...(stellarId ? [stellarId] : [])].map((id) => ({
      value: id,
      label: networkName(id),
      description:
        id === settings.homeNetwork
          ? en
            ? 'Recommended: your main network'
            : 'Recomendada: tu red principal'
          : undefined,
      tone: 'info' as const,
    }));
  }

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
          ? 'Share your address to receive from another wallet or an exchange.'
          : 'Comparte tu dirección para recibir desde otra wallet o un exchange.'}
      </p>
      <div className="mb-5 flex items-center gap-2">
        {advanced ? (
          <SelectMenu
            label={en ? 'Network' : 'Red'}
            showLabel={false}
            value={chosenNetwork}
            options={networkOptions()}
            onChange={(id) => {
              setNetworkId(id);
              setSymbol('USDC');
              setRequested(null);
            }}
            english={en}
            className="min-w-0 flex-1"
          />
        ) : null}
        <TokenSelect
          value={coin.symbol}
          label={en ? 'Currency' : 'Moneda'}
          options={coins.map((item) => ({
            value: item.symbol,
            symbol: item.symbol,
            label: item.name,
          }))}
          onChange={(value) => {
            setSymbol(value);
            setRequested(null);
          }}
          english={en}
        />
      </div>
      <MoneyPanel className="mb-4">
        <AddressQRCard address={session.wallet.address} chainId={chain.id} english={en} />
      </MoneyPanel>
      <NoticeCard
        tone="warning"
        title={
          en
            ? `Only ${coin.symbol}, only on ${network}`
            : `Solo ${coin.symbol} y solo por ${network}`
        }
      >
        {en
          ? `In the exchange, choose ${coin.symbol} and the ${network} network before pasting the address. On another network, the money may not reach your account.`
          : `En el exchange, elige ${coin.symbol} y la red ${network} antes de pegar la dirección. Por otra red, el dinero puede no llegar a tu cuenta.`}
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
