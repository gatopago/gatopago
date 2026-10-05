'use client';

import { useState } from 'react';
import { walletNetwork } from '@gatopago/shared/networks';
import { AddressQRCard } from '../consumer/AddressQRCard';
import { BackHeader, MoneyPanel, NoticeCard, SectionLabel } from '../consumer/Primitives';
import { SelectMenu } from '../consumer/SelectMenu';
import { TokenSelect } from '../consumer/TokenSelect';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import type { Session } from './session';

/** `/receive`, as in V2: network, asset, QR and the warnings a wallet or exchange needs. */
export function Receive({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const [networkId, setNetworkId] = useState(settings.homeNetwork);
  const [asset, setAsset] = useState('USDC');
  const { chain } = walletNetwork(networkId);
  const network = networkName(networkId);
  const native = chain.nativeCurrency;
  return (
    <>
      <BackHeader
        title={en ? 'Receive into my account' : 'Recibir en mi cuenta'}
        english={en}
        to="/move?flow=receive"
      />
      <p className="mb-5 text-[14px] leading-relaxed text-text-muted">
        {en
          ? 'Share your QR or address to receive from a wallet or exchange.'
          : 'Comparte tu QR o dirección para recibir desde una wallet o exchange.'}
      </p>
      <SelectMenu
        label={en ? 'Choose network' : 'Elegir red'}
        showLabel={false}
        value={networkId}
        options={settings.networks.map((id) => ({
          value: id,
          label: networkName(id),
          description:
            id === settings.homeNetwork
              ? en
                ? 'Recommended: where your balance lives'
                : 'Recomendada: donde vive tu saldo'
              : undefined,
          tone: 'info' as const,
        }))}
        onChange={(id) => {
          setNetworkId(id);
          setAsset('USDC');
        }}
        english={en}
        className="mb-5"
      />
      <SectionLabel>{en ? 'Wallet or exchange' : 'Wallet o exchange'}</SectionLabel>
      <MoneyPanel className="mb-3 p-6">
        <p className="mb-1 text-[15px] text-text">
          {en ? `Receive ${asset} on ${network}` : `Recibir ${asset} en ${network}`}
        </p>
        <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
          {en
            ? 'Choose the asset and share this address. The wallet or exchange must use the exact network shown.'
            : 'Elige el activo y comparte esta dirección. La wallet o el exchange debe usar exactamente la red indicada.'}
        </p>
        <div className="mb-5">
          <TokenSelect
            value={asset}
            options={[
              { value: 'USDC', symbol: 'USDC', label: 'USD Coin' },
              { value: native.symbol, symbol: native.symbol, label: native.name },
            ]}
            onChange={setAsset}
            english={en}
          />
        </div>
        <AddressQRCard address={session.wallet.address} chainId={chain.id} english={en} />
        <NoticeCard
          className="mt-4"
          title={en ? `${asset} on ${network} only` : `Solo ${asset} en ${network}`}
        >
          {en
            ? `Sending ${asset} over another network does not credit this account automatically.`
            : `Enviar ${asset} por otra red no acredita esta cuenta automáticamente.`}
        </NoticeCard>
        <p className="mt-4 text-[12px] leading-relaxed text-text-faint">
          {en
            ? `In your exchange, select ${asset} and the ${network} network before pasting this address.`
            : `En tu exchange, selecciona ${asset} y la red ${network} antes de pegar esta dirección.`}
        </p>
      </MoneyPanel>
    </>
  );
}
