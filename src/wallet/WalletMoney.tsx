'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getAddress } from 'viem';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { atomicToDecimal, decimalToAtomic } from '@gatopago/shared/v3/amount';
import type { CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { parseMoneyRequest, type MoneyKind } from '@gatopago/shared/v3/money-wire';
import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice } from './balances';
import type { MoneySelection } from './money-release';
import type { MoneyPreparation } from './money';
import { MoneyOperationReview } from './MoneyOperationReview';
import {
  moneyBookmarkSnapshot,
  moneyBookmarkServerSnapshot,
  moneyStoredSnapshot,
  moneyStoredServerSnapshot,
  parseMoneyBookmark,
  subscribeMoneyBookmark,
  saveMoneyBookmark,
  type MoneyBookmark,
} from './money-bookmark';

type Session = Awaited<ReturnType<BrowserAuth['money']>>;
type Opened = {
  session: Session;
  selected: MoneySelection;
  capabilities: Awaited<ReturnType<Session['capabilities']>>;
  position: Awaited<ReturnType<Session['position']>>;
};
type Prepared = {
  session: Session;
  selected: MoneySelection;
  preparation: MoneyPreparation;
  credentials: CredentialDetail[];
  restored: boolean;
};
export function WalletMoney(props: {
  runtime: BrowserAuth;
  uid: string;
  account: AccountChoice;
  english: boolean;
  mode: 'grow' | 'pay';
}) {
  return (
    <OwnedWalletMoney key={JSON.stringify([props.uid, props.account, props.mode])} {...props} />
  );
}
function OwnedWalletMoney({
  runtime,
  uid,
  account,
  english: en,
  mode,
}: Parameters<typeof WalletMoney>[0]) {
  const [opened, setOpened] = useState<Opened | null>(null),
    [prepared, setPrepared] = useState<Prepared | null>(null);
  const [amount, setAmount] = useState(''),
    [recipient, setRecipient] = useState(''),
    [kind, setKind] = useState<MoneyKind>(mode === 'pay' ? 'aave_withdraw_and_pay' : 'aave_supply');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [closed, setClosed] = useState(false),
    [stale, setStale] = useState(false);
  const active = useRef<AbortController | null>(null),
    mounted = useRef(false),
    form = useId();
  const hash = useSyncExternalStore(
    subscribeMoneyBookmark,
    moneyBookmarkSnapshot,
    moneyBookmarkServerSnapshot,
  );
  const stored = useSyncExternalStore(
    subscribeMoneyBookmark,
    () => {
      try {
        return moneyStoredSnapshot({ wallet_id: account.wallet_id, wallet_account_id: account.id });
      } catch {
        return 'invalid';
      }
    },
    moneyStoredServerSnapshot,
  );
  const saved: MoneyBookmark[] = useMemo(
    () =>
      stored === 'invalid'
        ? []
        : JSON.parse(stored).map((value: string) => parseMoneyBookmark(value)),
    [stored],
  );
  const bookmark = useMemo(() => {
    try {
      return parseMoneyBookmark(hash);
    } catch {
      return 'invalid' as const;
    }
  }, [hash]);
  const matching =
    bookmark &&
    bookmark !== 'invalid' &&
    bookmark.wallet_id === account.wallet_id &&
    bookmark.wallet_account_id === account.id &&
    bookmark.network_id === account.network_id;
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) {
        active.current?.abort();
        setClosed(true);
        setPrepared(null);
        setOpened(null);
      }
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      queueMicrotask(() => {
        if (!mounted.current) active.current?.abort();
      });
    };
  }, [runtime, uid]);
  useEffect(() => {
    if (!opened) return;
    const expires = Math.min(opened.position.expires_at, opened.capabilities.expires_at);
    const timer = setTimeout(() => setStale(true), Math.max(0, expires * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [opened]);
  async function capture(signal: AbortSignal) {
    const contexts = runtime.accountContexts(uid);
    const [context, session] = await Promise.all([
      contexts.read(account, signal),
      runtime.money(uid),
    ]);
    contexts.assertCurrent();
    session.assertCurrent();
    signal.throwIfAborted();
    return { session, selected: session.selection(context) };
  }
  async function open(restore = false, savedInput?: MoneyBookmark) {
    if (active.current || closed) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(false);
    try {
      const { session, selected } = await capture(controller.signal);
      if (restore) {
        const locator = savedInput ?? bookmark;
        if (
          !locator ||
          locator === 'invalid' ||
          locator.wallet_id !== account.wallet_id ||
          locator.wallet_account_id !== account.id
        )
          throw new Error('MONEY_LOCATOR_MISMATCH');
        saveMoneyBookmark(locator);
        const preparation = await session.restorePreparation(
          selected,
          locator.preparation_id,
          controller.signal,
        );
        if (locator.operation_id !== null && locator.operation_id !== preparation.operation_id)
          throw new Error('MONEY_LOCATOR_MISMATCH');
        controller.signal.throwIfAborted();
        session.assertCurrent();
        if (mounted.current)
          setPrepared({ session, selected, preparation, credentials: [], restored: true });
      } else {
        const [capabilities, position] = await Promise.all([
          session.capabilities(selected, controller.signal),
          session.position(selected, controller.signal),
        ]);
        controller.signal.throwIfAborted();
        session.assertCurrent();
        if (mounted.current) {
          setOpened({ session, selected, capabilities, position });
          setStale(false);
        }
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(true);
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  async function prepare() {
    if (
      !opened ||
      active.current ||
      closed ||
      prepared ||
      hash ||
      saved.length ||
      stored === 'invalid' ||
      stale ||
      !opened.capabilities.features[kind]
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(false);
    const input = { kind, amount, recipient };
    try {
      opened.session.assertCurrent();
      const request = parseMoneyRequest({
        schema_version: 1,
        kind: input.kind,
        wallet_id: account.wallet_id,
        wallet_account_id: account.id,
        network_id: account.network_id,
        market_id: 'aave-v3-arbitrum-sepolia-usdc',
        asset_id: JSON.parse(opened.selected.market.document).asset_id,
        amount_atomic: decimalToAtomic(input.amount, 6),
        client_release_id: CLIENT_RELEASE_ID,
        ...(input.kind === 'aave_withdraw_and_pay'
          ? { recipient_address: getAddress(input.recipient) }
          : {}),
      });
      const credentialsSession = runtime.credentialInventory(uid),
        inventory = await credentialsSession.read(controller.signal),
        credentials: CredentialDetail[] = [];
      for (let offset = 0; offset < inventory.data.length; offset += 4) {
        controller.signal.throwIfAborted();
        credentials.push(
          ...(await Promise.all(
            inventory.data
              .slice(offset, offset + 4)
              .map((c) => credentialsSession.detail(c.credential_ref, controller.signal)),
          )),
        );
      }
      credentialsSession.assertCurrent();
      opened.session.assertCurrent();
      // Credential discovery finishes before the short financial review window.
      const preparation = await opened.session.prepare(
        opened.selected,
        request,
        crypto.randomUUID(),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      opened.session.assertCurrent();
      if (mounted.current)
        setPrepared({
          session: opened.session,
          selected: opened.selected,
          preparation,
          credentials,
          restored: !!preparation.operation_id,
        });
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(true);
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  if (closed)
    return (
      <p role="alert">
        {en
          ? 'Your session changed. Reopen this account.'
          : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}
      </p>
    );
  if (prepared)
    return (
      <MoneyOperationReview
        runtime={runtime}
        uid={uid}
        {...prepared}
        english={en}
        onClose={() => {
          setPrepared(null);
          setOpened(null);
          setAmount('');
          setRecipient('');
        }}
      />
    );
  if (account.network_id !== 'eip155:421614')
    return (
      <p>
        {en
          ? 'This market is available only on Arbitrum Sepolia.'
          : 'Este mercado está disponible sólo en Arbitrum Sepolia.'}
      </p>
    );
  const position = opened?.position,
    capability = opened?.capabilities.features[kind];
  return (
    <section className="money-panel" aria-busy={busy}>
      <h3>{en ? 'Your Aave USDC position' : 'Tu posición USDC en Aave'}</h3>
      <p>Arbitrum Sepolia · {en ? 'testnet' : 'red de prueba'}</p>
      {position ? (
        <dl>
          <dt>{en ? 'USDC in your account' : 'USDC en tu cuenta'}</dt>
          <dd>{atomicToDecimal(position.usdc_balance_atomic, 6)} USDC</dd>
          <dt>
            {en
              ? 'Aave position, including observed interest'
              : 'Posición Aave, incluido el interés observado'}
          </dt>
          <dd>{atomicToDecimal(position.position_balance_atomic, 6)} USDC</dd>
        </dl>
      ) : null}
      <p>
        {en
          ? 'The position is separate from your account balance. Interest and withdrawal liquidity are variable.'
          : 'La posición está separada del saldo de tu cuenta. El interés y la liquidez para retirar son variables.'}
      </p>
      <button
        type="button"
        className="auth-secondary btn btn-ghost btn-block"
        disabled={busy}
        onClick={() => void open()}
      >
        {en ? 'Refresh position' : 'Actualizar posición'}
      </button>
      {matching ? (
        <button
          type="button"
          className="auth-primary btn btn-primary btn-block"
          disabled={busy}
          onClick={() => void open(true)}
        >
          {en ? 'Recover this operation' : 'Recuperar esta operación'}
        </button>
      ) : null}
      {!hash
        ? saved.map((locator) => (
            <button
              type="button"
              key={locator.preparation_id}
              className="auth-secondary btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => void open(true, locator)}
            >
              {en ? 'Recover saved operation' : 'Recuperar operación guardada'} ·{' '}
              {(locator.operation_id ?? locator.preparation_id).slice(-8)}
            </button>
          ))
        : null}
      {stored === 'invalid' ? (
        <p role="alert">
          {en
            ? 'Saved references could not be read. Resolve them before starting another operation.'
            : 'No se pudieron leer las referencias guardadas. Resuélvelas antes de iniciar otra operación.'}
        </p>
      ) : null}
      {hash && !matching ? (
        <p role="alert">
          {en
            ? 'An existing reference belongs to another account or is invalid. Recover it before starting another operation.'
            : 'La referencia existente pertenece a otra cuenta o no es válida. Recupérala antes de iniciar otra operación.'}
        </p>
      ) : null}
      {opened ? (
        <>
          {stale ? (
            <p role="status">
              {en
                ? 'Refresh this position before preparing another review.'
                : 'Actualiza esta posición antes de preparar otra revisión.'}
            </p>
          ) : null}
          {position?.debt_base_atomic !== '0' ? (
            <p role="alert">
              {en
                ? 'These operations require an account without Aave debt.'
                : 'Estas operaciones requieren una cuenta sin deuda en Aave.'}
            </p>
          ) : null}
          {mode === 'grow' ? (
            <label htmlFor={`${form}-kind`}>
              {en ? 'Action' : 'Acción'}
              <select
                id={`${form}-kind`}
                value={kind}
                disabled={busy}
                onChange={(event) => {
                  setKind(event.target.value as MoneyKind);
                  setError(false);
                }}
              >
                <option value="aave_supply">{en ? 'Deposit' : 'Depositar'}</option>
                <option value="aave_withdraw">{en ? 'Withdraw' : 'Retirar'}</option>
              </select>
            </label>
          ) : null}
          <label htmlFor={`${form}-amount`}>
            {en ? 'Exact amount in USDC' : 'Importe exacto en USDC'}
            <input
              id={`${form}-amount`}
              inputMode="decimal"
              autoComplete="off"
              maxLength={80}
              value={amount}
              disabled={busy}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(false);
              }}
            />
          </label>
          {mode === 'pay' ? (
            <label htmlFor={`${form}-recipient`}>
              {en ? 'Recipient address' : 'Dirección del destinatario'}
              <input
                id={`${form}-recipient`}
                autoComplete="off"
                spellCheck={false}
                maxLength={42}
                value={recipient}
                disabled={busy}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setError(false);
                }}
              />
            </label>
          ) : null}
          {!capability ? (
            <p role="status">
              {en
                ? 'This operation is not available yet.'
                : 'Esta operación todavía no está disponible.'}
            </p>
          ) : null}
          <button
            className="auth-primary btn btn-primary btn-block"
            type="button"
            disabled={
              busy ||
              stale ||
              !!hash ||
              !!saved.length ||
              stored === 'invalid' ||
              !capability ||
              !amount ||
              (mode === 'pay' && !recipient) ||
              position?.debt_base_atomic !== '0' ||
              !position?.active ||
              position?.paused ||
              (kind === 'aave_supply' && position?.frozen)
            }
            onClick={() => void prepare()}
          >
            {en ? 'Review operation' : 'Revisar operación'}
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert">
          {en
            ? 'We could not verify this position or prepare the review. An unavailable observation does not mean a zero balance.'
            : 'No pudimos verificar la posición o preparar la revisión. Una observación no disponible no significa saldo cero.'}
        </p>
      ) : null}
    </section>
  );
}
