'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Address } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount } from '../wallet/account';
import { api, ApiError } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import { BackHeader, MoneyPanel, NoticeCard, TransactionActions } from './Primitives';
import { localizedPath } from './routes';
import { StageOverlay } from './StageOverlay';
import { TxResult } from './TxResult';

/** A sign-in request of GatoPago Business: 32 hex characters, from the console's QR. */
export const businessRequest = (value: string | null) =>
  value && /^[0-9a-f]{32}$/.test(value) ? value : null;

/**
 * What the passkey signs to approve the console's sign-in: SIWE for the app's domain whose nonce
 * is the request, so the approval works for that request only.
 */
export function approvalMessage(input: {
  webOrigin: string;
  address: Address;
  chainId: number;
  request: string;
  issuedAt?: Date;
}) {
  return createSiweMessage({
    domain: new URL(input.webOrigin).host,
    uri: input.webOrigin,
    address: input.address,
    chainId: input.chainId,
    nonce: input.request,
    version: '1',
    issuedAt: input.issuedAt ?? new Date(),
    statement: 'Sign in to GatoPago Business.',
  });
}

const expired = (failure: unknown) =>
  failure instanceof ApiError && failure.code === 'LOGIN_EXPIRED';

/**
 * `/approve?request=…`, opened from the QR of GatoPago Business (business.gatopago.com): shows which
 * computer asks to sign in and approves it with the passkey.
 */
export function ApproveScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const request = businessRequest(useSearchParams().get('request'));
  const [login, setLogin] = useState<{
    device: string;
    place: string | null;
    expires_at: number;
  } | null>(null);
  const [state, setState] = useState<'reading' | 'ready' | 'approved' | 'expired'>(
    request ? 'reading' : 'expired',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    api<{ device: string; place: string | null; expires_at: number }>(
      settings.apiOrigin,
      `business-approvals/${request}`,
      { token: session.token, signal: controller.signal },
    )
      .then((value) => {
        setLogin(value);
        setState('ready');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (expired(failure)) setState('expired');
        else setError(failureMessage(failure, en));
      });
    return () => controller.abort();
  }, [request, settings, session, en]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(clock);
  }, []);

  const left = login ? login.expires_at - now : 0;
  const shownState = state === 'ready' && left <= 0 ? 'expired' : state;
  const title = en ? 'Sign in to Business' : 'Entrar a Negocios';

  async function approve() {
    if (!request) return;
    setBusy(true);
    setError('');
    try {
      const account = await gatopagoAccount(settings, session.wallet, settings.homeNetwork);
      const message = approvalMessage({
        webOrigin: settings.webOrigin,
        address: account.address,
        chainId: walletNetwork(settings.homeNetwork).chain.id,
        request,
      });
      const signature = await account.signMessage({ message });
      await api(settings.apiOrigin, `business-approvals/${request}`, {
        token: session.token,
        body: { message, signature },
      });
      setState('approved');
    } catch (failure) {
      if (expired(failure)) setState('expired');
      else setError(failureMessage(failure, en));
    } finally {
      setBusy(false);
    }
  }

  const home = (
    <NavigationLink href={localizedPath('/app', en)} className="btn btn-primary btn-block mt-6">
      {en ? 'Go to home' : 'Ir al inicio'}
    </NavigationLink>
  );

  if (shownState === 'approved')
    return (
      <>
        <BackHeader title={title} english={en} />
        <TxResult
          state="success"
          lead={en ? 'Approved' : 'Aprobado'}
          body={
            en
              ? 'GatoPago Business is opening on your computer. You can close this screen.'
              : 'GatoPago Negocios se está abriendo en tu computadora. Puedes cerrar esta pantalla.'
          }
        >
          {home}
        </TxResult>
      </>
    );

  if (shownState === 'expired')
    return (
      <>
        <BackHeader title={title} english={en} />
        <TxResult
          state="failed"
          lead={en ? 'This code expired' : 'Este código venció'}
          body={
            en
              ? 'Codes last two minutes. Scan the new one the console shows on your computer.'
              : 'Los códigos duran dos minutos. Escanea el nuevo que muestra la consola en tu computadora.'
          }
        >
          {home}
        </TxResult>
      </>
    );

  return (
    <>
      <BackHeader title={title} english={en} />
      <StageOverlay
        label={busy ? (en ? 'Confirm on your device…' : 'Confirma en tu dispositivo…') : null}
        spinner={false}
      />
      <MoneyPanel className="mb-4 flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="mb-4 grid h-14 w-14 place-items-center border-2 border-text bg-cat-500 shadow-[4px_4px_0_var(--color-cat-700)]"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="12" rx="1" />
            <path d="M8 20h8M12 16v4" />
          </svg>
        </span>
        <h2 className="font-display text-[20px] leading-tight">
          {en
            ? 'Sign in to GatoPago Business on your computer?'
            : '¿Entras a GatoPago Negocios en tu computadora?'}
        </h2>
        {login ? (
          <>
            <p className="mt-3 text-[16px] font-semibold">{login.device}</p>
            {login.place ? (
              <p className="text-[13px] text-text-muted">
                {en ? 'Near ' : 'Cerca de '}
                {login.place}
              </p>
            ) : null}
            <p className="mt-3 font-mono text-[12px] text-text-faint" aria-live="off">
              {en ? 'Expires in ' : 'Vence en '}
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[13px] text-text-muted">
            {error || (en ? 'Reading…' : 'Leyendo…')}
          </p>
        )}
      </MoneyPanel>
      <NoticeCard
        tone="warning"
        title={en ? 'Approve only if it was you' : 'Aprueba solo si fuiste tú'}
      >
        {en
          ? 'If someone asked you to scan this code, do not approve it: they would see your charges and manage your API keys. Your money stays safe either way.'
          : 'Si alguien te pidió escanear este código, no lo apruebes: vería tus cobros y manejaría tus claves API. Tu dinero sigue a salvo de todas formas.'}
      </NoticeCard>
      {error && login ? (
        <p role="alert" className="mt-4 text-center text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <TransactionActions>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!login || busy}
          onClick={() => void approve()}
        >
          {en ? 'Approve' : 'Aprobar'}
        </button>
        <NavigationLink href={localizedPath('/app', en)} className="btn-text mt-1 w-full">
          {en ? 'It was not me' : 'No fui yo'}
        </NavigationLink>
      </TransactionActions>
    </>
  );
}
