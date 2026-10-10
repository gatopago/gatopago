'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Address, Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { walletNetwork } from '@gatopago/shared/networks';
import { businessKeyResource } from '@gatopago/shared/passkey';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount } from '../wallet/account';
import { api, ApiError } from '../wallet/api';
import { useFailureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { useAction } from '../wallet/useAction';
import { NavigationLink } from './NavigationLink';
import { BackHeader, MoneyPanel, NoticeCard, TransactionActions } from './Primitives';
import { StageOverlay } from './StageOverlay';
import { TxResult } from './TxResult';
import { useTranslations } from 'next-intl';

/** A sign-in request of GatoPago Business: 32 hex characters, from the console's QR. */
export const businessRequest = (value: string | null) =>
  value && /^[0-9a-f]{32}$/.test(value) ? value : null;

/**
 * What the passkey signs to approve the console's sign-in: SIWE for the app's domain whose nonce
 * is the request, so the approval works for that request only. A console that asked with its
 * Business key gets that exact key approved too, named among the resources.
 */
export function approvalMessage(input: {
  webOrigin: string;
  address: Address;
  chainId: number;
  request: string;
  businessKey?: Hex | null;
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
    ...(input.businessKey && { resources: [businessKeyResource(input.businessKey)] }),
  });
}

/** The console's request as the member sees it: its browser, place and the key it would keep. */
interface Login {
  device: string;
  place: string | null;
  expires_at: number;
  /** The console's Business key, kept with access until removed in Security; null for one visit. */
  public_key: Hex | null;
}

const expired = (failure: unknown) =>
  failure instanceof ApiError && failure.code === 'LOGIN_EXPIRED';

/**
 * `/approve?request=…`, opened from the QR of GatoPago Business (business.gatopago.com): shows which
 * computer asks to sign in and approves it with the passkey. Keyed by request: another QR starts
 * from nothing, so what is shown (device, place, approved) is always the request being signed.
 */
export function ApproveScreen(props: { settings: ClientSettings; session: Session }) {
  const request = businessRequest(useSearchParams().get('request'));
  return <ApproveRequest key={request ?? ''} request={request} {...props} />;
}

function ApproveRequest({
  request,
  settings,
  session,
}: {
  request: string | null;
  settings: ClientSettings;
  session: Session;
}) {
  const messageFor = useFailureMessage();
  const t = useTranslations('Approve');
  const [login, setLogin] = useState<Login | null>(null);
  const [state, setState] = useState<'reading' | 'ready' | 'approved' | 'expired'>(
    request ? 'reading' : 'expired',
  );
  // One approval at a time: a double tap must not open two passkey prompts.
  const { busy, error, setError, run } = useAction();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    api<Login>(settings.apiOrigin, `business-approvals/${request}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((value) => {
        setLogin(value);
        setState('ready');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (expired(failure)) setState('expired');
        else setError(messageFor(failure));
      });
    return () => controller.abort();
  }, [request, settings, session, messageFor, setError]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(clock);
  }, []);

  const left = login ? login.expires_at - now : 0;
  const shownState = state === 'ready' && left <= 0 ? 'expired' : state;
  const title = t('signBusiness');

  function approve() {
    if (!request) return;
    void run(async () => {
      try {
        const account = await gatopagoAccount(settings, session.wallet, settings.homeNetwork);
        const message = approvalMessage({
          webOrigin: settings.webOrigin,
          address: account.address,
          chainId: walletNetwork(settings.homeNetwork).chain.id,
          request,
          businessKey: login?.public_key,
        });
        const signature = await account.signMessage({ message });
        await api(settings.apiOrigin, `business-approvals/${request}`, {
          token: session.token,
          body: { message, signature, initial_owners: session.wallet.initialOwners },
        });
        setState('approved');
      } catch (failure) {
        if (!expired(failure)) throw failure;
        setState('expired');
      }
    });
  }

  const home = (
    <NavigationLink href={'/app'} className="btn btn-primary btn-block mt-6">
      {t('goHome')}
    </NavigationLink>
  );

  if (shownState === 'approved')
    return (
      <>
        <BackHeader title={title} />
        <TxResult state="success" lead={t('approved')} body={t('gatopagoBusinessOpeningComputer')}>
          {home}
        </TxResult>
      </>
    );

  if (shownState === 'expired')
    return (
      <>
        <BackHeader title={title} />
        <TxResult state="failed" lead={t('codeExpired')} body={t('codesLastTwoMinutes')}>
          {home}
        </TxResult>
      </>
    );

  return (
    <>
      <BackHeader title={title} />
      <StageOverlay label={busy ? t('confirmDevice') : null} spinner={false} />
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
          {t('signGatopagoBusinessComputer')}
        </h2>
        {login ? (
          <>
            <p className="mt-3 text-[16px] font-semibold">{login.device}</p>
            {login.place ? (
              <p className="text-[13px] text-text-muted">{t('near', { place: login.place })}</p>
            ) : null}
            <p className="mt-3 font-mono text-[12px] text-text-faint" aria-live="off">
              {t('expires', {
                time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
              })}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[13px] text-text-muted">{error || t('reading')}</p>
        )}
      </MoneyPanel>
      <NoticeCard tone="warning" title={t('approveOnlyIf')}>
        {t('ifSomeoneAskedScan')}
      </NoticeCard>
      {login?.public_key ? (
        <p className="mt-4 text-[13px] leading-relaxed text-text-muted">{t('keyKeepsAccess')}</p>
      ) : null}
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
          {t('approve')}
        </button>
        <NavigationLink href={'/app'} className="btn-text mt-1 w-full">
          {t('notMe')}
        </NavigationLink>
      </TransactionActions>
    </>
  );
}
