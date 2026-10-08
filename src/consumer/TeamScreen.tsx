'use client';

import { walletAssets } from '@gatopago/shared/assets';
import { useEffect, useState, type FormEvent } from 'react';
import { useAction } from '../wallet/useAction';
import { useSearchParams } from 'next/navigation';
import { isAddress, isAddressEqual, parseUnits, type Address, type Hex } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import {
  MAX_PAYOUTS,
  payFromSavingsCalls,
  payoutCalls,
  payoutTotal,
  splitAmounts,
  splitCalls,
  type Payout,
} from '@gatopago/shared/rules';
import type { ClientSettings } from '../lib/settings';
import { networkName, shortAddress, USDC_DECIMALS } from '../wallet/account';
import { api, type Recipient } from '../wallet/api';
import { formatBalance, formatUsdc, useBalances } from '../wallet/balances';
import { send } from '../wallet/operations';
import { failureMessage } from '../wallet/messages';
import {
  openVault,
  readVaultRecord,
  vaultState,
  writeVaultRecord,
  type VaultState,
} from '../wallet/vault';
import { ElsewhereNote } from './ElsewhereNote';
import { RecipientShortcuts } from './RecipientShortcuts';
import { TokenSelect } from './TokenSelect';
import type { Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import {
  ConfirmDetails,
  ConfirmSheet,
  ReceiptScreen,
  SigningDetails,
  type ReceiptData,
} from './PaymentSheets';
import { BackHeader, MoneyPanel, TransactionActions } from './Primitives';
import { localizedPath } from './routes';
import { StageOverlay } from './StageOverlay';

/** One person in the team: their @username or address, a fixed amount and a share (%). */
interface Member {
  id: number;
  who: string;
  amount: string;
  share: string;
}

/** A reviewed payout: who receives, as the person reads it, and the amount. */
type Line = Payout & { label: string };
/** Fixed amounts per person, or shares of an amount that arrived (with a part saved). */
type Mode = 'amounts' | 'shares';
type Source = 'available' | 'savings';
interface Review {
  mode: Mode;
  /** The coin paid: USDC (`token` unset, savings possible) or another token on its network. */
  symbol: string;
  token?: Address;
  from: Source;
  lines: Line[];
  /** Saved in Aave (shares only). */
  save: bigint;
  /** Stays available (shares only). */
  keep: bigint;
  total: bigint;
}

const teamKey = (account: Address) => `gatopago.team.${account.toLowerCase()}`;
const units = (value: string, decimals: number) =>
  parseUnits(value.replace(',', '.') || '0', decimals);
/** A percentage as typed ("12,5") in basis points. */
const basisPoints = (value: string) => Math.round(Number(value.replace(',', '.') || '0') * 100);

/** A team as it is saved: who, and how much or what share. */
type SavedMember = Pick<Member, 'who' | 'amount' | 'share'>;
const plainTeam = (team: Member[]): SavedMember[] =>
  team.map(({ who, amount, share }) => ({ who, amount, share }));
const members = (list: unknown): Member[] | null =>
  Array.isArray(list) && list.length > 0
    ? list.map((member: Partial<Member>, id: number) => ({
        id,
        who: member.who ?? '',
        amount: member.amount ?? '',
        share: member.share ?? '',
      }))
    : null;

/** The team paid last from this device, until it is saved in the vault (then only there). */
function rememberedTeam(account: Address): Member[] {
  try {
    const team = members(JSON.parse(localStorage.getItem(teamKey(account)) ?? 'null'));
    if (team) return team;
  } catch {
    // Nothing remembered.
  }
  return [0, 1].map((id) => ({ id, who: '', amount: '', share: '' }));
}

function rememberTeam(account: Address, team: Member[]) {
  try {
    localStorage.setItem(teamKey(account), JSON.stringify(plainTeam(team)));
  } catch {
    // The payment does not depend on it.
  }
}

/** Once the team lives in the vault, nothing about it stays on this device's disk. */
function forgetTeam(account: Address) {
  try {
    localStorage.removeItem(teamKey(account));
  } catch {
    // Nothing to forget.
  }
}

/**
 * `/team`, "Pay my team": several people paid in one operation and one signature, either fixed
 * amounts (from the available balance or straight from savings in Aave) or shares of an amount
 * that arrived, with a part saved (`/team?split=<amount>` opens it on a paid charge). Every
 * payment goes through or none does.
 */
export function TeamScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const params = useSearchParams();
  const account = session.wallet.address;
  const { balances, saved, holding, refresh } = useBalances(settings, session);
  // USDC, or another dollar the wallet holds (AUSD), paid on the network that holds it.
  const others = walletAssets(settings.networks).filter(
    (asset) => asset.symbol !== 'USDC' && asset.holdings.every(({ token }) => token !== null),
  );
  const [coin, setCoin] = useState('USDC');
  const chosen = others.find((asset) => asset.symbol === coin);
  const symbol = chosen?.symbol ?? 'USDC';
  const decimals = chosen?.decimals ?? USDC_DECIMALS;
  const [mode, setMode] = useState<Mode>(params.get('split') ? 'shares' : 'amounts');
  const [team, setTeam] = useState<Member[]>(() => rememberedTeam(account));
  const [splitting, setSplitting] = useState(params.get('split') ?? '');
  const [saveShare, setSaveShare] = useState('');
  // It pays from the home network, where USDC lives; another coin, from its own network.
  const networkId = chosen ? chosen.holdings[0].networkId : settings.homeNetwork;
  const [source, setSource] = useState<Source>('available');
  const [reference, setReference] = useState(params.get('reference') ?? '');
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<(ReceiptData & { review: Review }) | null>(null);
  const { busy, error, run: perform } = useAction(en);
  // The team saved in the vault, readable with the passkey on any device. `null` while asking;
  // `off` when Wallet Core cannot say (then the team stays on this device, as before).
  const [vault, setVault] = useState<VaultState | 'off' | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultNote, setVaultNote] = useState('');
  useEffect(() => {
    let active = true;
    vaultState(settings, session)
      .then(async (state) => {
        if (!active) return;
        setVault(state);
        // Already open in this session: the saved team comes in without asking for anything.
        if (state === 'open') {
          const team = members(await readVaultRecord(settings, session, 'team'));
          if (active && team) setTeam(team);
          forgetTeam(account);
        }
      })
      .catch(() => {
        if (active) setVault('off');
      });
    return () => {
      active = false;
    };
  }, [settings, session, account]);

  /** Opens the vault (one prompt; the first time it creates it), then brings or saves the team. */
  function withVault(then: () => Promise<void>) {
    setVaultBusy(true);
    setVaultNote('');
    openVault(settings, session)
      .then(async () => {
        setVault('open');
        await then();
        forgetTeam(account);
      })
      .catch((failure: unknown) => setVaultNote(failureMessage(failure, en)))
      .finally(() => setVaultBusy(false));
  }
  const bringTeam = () =>
    withVault(async () => {
      const team = members(await readVaultRecord(settings, session, 'team'));
      if (team) setTeam(team);
    });
  const named = team.filter(({ who }) => who.trim());
  const saveTeam = () =>
    withVault(() => writeVaultRecord(settings, session, 'team', plainTeam(named)));

  const network = walletNetwork(networkId);
  // Savings (Aave) hold USDC only.
  const canSave = !chosen && Boolean(network.aave);
  // Shares split money that arrived: it is available, and savings only receive.
  const from: Source = canSave && mode === 'amounts' ? source : 'available';
  const funds = chosen
    ? holding(chosen.holdings[0])
    : from === 'savings'
      ? saved[networkId]
      : balances[networkId];
  const sum = (() => {
    try {
      return mode === 'shares'
        ? units(splitting, decimals)
        : team.reduce((total, member) => total + units(member.amount, decimals), 0n);
    } catch {
      return 0n;
    }
  })();

  const update = (id: number, change: Partial<Member>) =>
    setTeam((current) =>
      current.map((member) => (member.id === id ? { ...member, ...change } : member)),
    );

  /** Who each filled row is: a GatoPago @username resolved to its account, or an address. */
  async function recipients(filled: Member[]) {
    const found: { to: Address; label: string }[] = [];
    for (const member of filled) {
      const who = member.who.trim();
      if (isAddress(who)) found.push({ to: who, label: shortAddress(who) });
      else {
        const recipient = await api<Recipient>(
          settings.apiOrigin,
          `recipients/${encodeURIComponent(who.replace(/^@/, '').toLowerCase())}`,
        );
        found.push({ to: recipient.address, label: `@${recipient.username}` });
      }
    }
    if (found.some(({ to }) => isAddressEqual(to, account))) throw new Error('SELF_TRANSFER');
    return found;
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    perform(async () => {
      const value = mode === 'shares' ? 'share' : 'amount';
      const filled = team.filter((member) => member.who.trim() || member[value].trim());
      const people = await recipients(filled);
      let next: Review;
      if (mode === 'amounts') {
        const lines = people.map((person, i) => ({
          ...person,
          amount: units(filled[i].amount, decimals),
        }));
        const total = payoutTotal(lines);
        next = {
          mode,
          symbol,
          token: chosen?.holdings[0].token ?? undefined,
          from,
          lines,
          save: 0n,
          keep: 0n,
          total,
        };
      } else {
        const amount = units(splitting, decimals);
        if (amount <= 0n) throw new Error('INVALID_AMOUNT');
        const split = splitAmounts(amount, {
          payouts: people.map(({ to }, i) => ({ to, bps: basisPoints(filled[i].share) })),
          saveBps: canSave ? basisPoints(saveShare) : 0,
        });
        const lines = split.payouts.map((payout) => ({
          ...payout,
          label: people.find(({ to }) => isAddressEqual(to, payout.to))!.label,
        }));
        if (lines.length > 0) payoutTotal(lines);
        const paid = lines.reduce((total, line) => total + line.amount, 0n);
        next = {
          mode,
          symbol,
          token: chosen?.holdings[0].token ?? undefined,
          from,
          lines,
          save: split.save,
          keep: amount - paid - split.save,
          total: paid + split.save,
        };
        if (next.total === 0n) throw new Error('INVALID_AMOUNT');
      }
      if ((funds ?? 0n) < next.total) throw new Error('INSUFFICIENT_FUNDS');
      // Where the team lives: in the vault when it is open, on this device while there is none.
      if (vault === 'open')
        void writeVaultRecord(settings, session, 'team', plainTeam(filled)).catch(() => undefined);
      else if (vault !== 'locked' && vault !== 'elsewhere') rememberTeam(account, filled);
      setReview(next);
    });
  }

  const callsFor = (current: Review) =>
    current.token
      ? payoutCalls(current.token, current.lines)
      : current.mode === 'shares'
        ? splitCalls(network, account, { payouts: current.lines, save: current.save })
        : current.from === 'savings'
          ? payFromSavingsCalls(network, account, current.lines)
          : payoutCalls(network.usdc, current.lines);

  function confirm(current: Review) {
    perform(async () => {
      const hash: Hex = await send(settings, session, networkId, callsFor(current));
      setReceipt({
        kind: 'sent',
        amount: current.total,
        currency: current.symbol,
        decimals,
        counterparty: en
          ? `${current.lines.length} ${current.lines.length === 1 ? 'person' : 'people'}`
          : `${current.lines.length} ${current.lines.length === 1 ? 'persona' : 'personas'}`,
        reference: reference.trim() || null,
        hash,
        networkId,
        date: Date.now(),
        review: current,
      });
      setReview(null);
      refresh();
    });
  }

  /** Each payout, then the saved and kept parts of a split. */
  const breakdown = (current: Review) => [
    ...current.lines.map(
      (line) => [line.label, `${formatUsdc(line.amount, en)} ${symbol}`] as const,
    ),
    ...(current.save > 0n
      ? ([
          [en ? 'To Grow (Aave)' : 'A Crecer (Aave)', `${formatUsdc(current.save, en)} ${symbol}`],
        ] as const)
      : []),
    ...(current.mode === 'shares'
      ? ([
          [en ? 'Stays available' : 'Te queda', `${formatUsdc(current.keep, en)} ${symbol}`],
        ] as const)
      : []),
  ];

  const title = en ? 'Pay my team' : 'Pagar a mi equipo';
  if (receipt)
    return (
      <>
        <BackHeader title={title} english={en} to="/move" />
        <ReceiptScreen receipt={receipt} english={en}>
          <ConfirmDetails rows={breakdown(receipt.review)} />
          <NavigationLink href={localizedPath('/app', en)} className="btn btn-ghost btn-block mt-4">
            {en ? 'Go to home' : 'Ir al inicio'}
          </NavigationLink>
          <button type="button" className="btn-text mt-1 w-full" onClick={() => setReceipt(null)}>
            {en ? 'Pay the team again' : 'Pagar al equipo otra vez'}
          </button>
        </ReceiptScreen>
      </>
    );

  return (
    <>
      <BackHeader title={title} english={en} to="/move" />
      <StageOverlay
        label={busy && !review ? (en ? 'Preparing the payments…' : 'Preparando los pagos…') : null}
      />
      <p className="mb-4 text-[14px] leading-relaxed text-text-muted">
        {en
          ? 'Pay several people at once with a single confirmation. Either every payment goes through or none does.'
          : 'Paga a varias personas a la vez con una sola confirmación. O se hacen todos los pagos, o ninguno.'}
      </p>
      <div className="seg-track seg-track-block mb-5">
        {(['amounts', 'shares'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="seg-item"
            aria-pressed={mode === option}
            data-active={mode === option}
            disabled={busy}
            onClick={() => setMode(option)}
          >
            {option === 'amounts'
              ? en
                ? 'Fixed amounts'
                : 'Montos fijos'
              : en
                ? 'Split an amount'
                : 'Repartir un monto'}
          </button>
        ))}
      </div>
      {error && !review ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={prepare} aria-busy={busy} className="flex flex-1 flex-col">
        {mode === 'shares' ? (
          <MoneyPanel className="mb-5">
            <label className="mb-2 block text-[13px] font-semibold" htmlFor="team-split">
              {en ? `Amount to split (${symbol})` : `Monto a repartir (${symbol})`}
            </label>
            <input
              id="team-split"
              inputMode="decimal"
              placeholder="0"
              value={splitting}
              disabled={busy}
              onChange={(event) => setSplitting(event.target.value.replace(/[^\d.,]/g, ''))}
              className="meli-field tabular h-12 text-[15px] placeholder:text-text-faint"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
              {en
                ? 'For example, a payment you just received. Give each person a share; what nobody gets stays available.'
                : 'Por ejemplo, un pago que acabas de recibir. Asigna un porcentaje a cada persona; lo que no repartas se queda disponible.'}
            </p>
          </MoneyPanel>
        ) : null}
        <MoneyPanel className="mb-5">
          <p className="text-[13px] font-semibold">{en ? 'Who gets paid' : 'A quién pagas'}</p>
          <p className="mb-3 text-[12px] text-text-muted">
            {en
              ? 'Their GatoPago @username or a 0x address.'
              : 'Su @usuario de GatoPago o una dirección 0x.'}
          </p>
          {vault === 'locked' ? (
            <div className="mb-3 flex items-center justify-between gap-3 border border-border bg-surface px-3 py-2">
              <p className="min-w-0 text-[13px]">
                {en ? 'You have a saved team.' : 'Tienes un equipo guardado.'}
              </p>
              <button
                type="button"
                disabled={vaultBusy || busy}
                onClick={bringTeam}
                className="min-h-11 shrink-0 px-1 text-[13px] font-semibold text-cat-700 underline underline-offset-2 disabled:opacity-50"
              >
                {vaultBusy
                  ? en
                    ? 'Confirm on your device…'
                    : 'Confirma en tu dispositivo…'
                  : en
                    ? 'Bring my team'
                    : 'Traer mi equipo'}
              </button>
            </div>
          ) : vault === 'elsewhere' ? (
            <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
              {failureMessage(new Error('VAULT_ELSEWHERE'), en)}
            </p>
          ) : null}
          {vaultNote ? (
            <p role="alert" className="mb-3 text-[12px] leading-relaxed text-pending">
              {vaultNote}
            </p>
          ) : null}
          <RecipientShortcuts
            settings={settings}
            session={session}
            english={en}
            selected={team.map(({ who }) => who.replace(/^@/, '').toLowerCase())}
            onPick={(username) =>
              setTeam((current) => {
                // Once per team: tapping a chosen person again takes them out of the list.
                const chosen = current.find(
                  ({ who }) => who.replace(/^@/, '').toLowerCase() === username,
                );
                if (chosen)
                  return current.length > 1
                    ? current.filter(({ id }) => id !== chosen.id)
                    : [{ ...chosen, who: '' }];
                const empty = current.find(({ who }) => !who.trim());
                if (empty)
                  return current.map((member) =>
                    member.id === empty.id ? { ...member, who: `@${username}` } : member,
                  );
                if (current.length >= MAX_PAYOUTS) return current;
                return [
                  ...current,
                  {
                    id: Math.max(-1, ...current.map(({ id }) => id)) + 1,
                    who: `@${username}`,
                    amount: '',
                    share: '',
                  },
                ];
              })
            }
            className="mb-3"
          />
          <ul className="flex flex-col gap-2.5">
            {team.map((member, index) => (
              <li key={member.id} className="flex items-center gap-2">
                <input
                  aria-label={en ? `Person ${index + 1}` : `Persona ${index + 1}`}
                  placeholder={en ? '@username' : '@usuario'}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={member.who}
                  disabled={busy}
                  onChange={(event) => update(member.id, { who: event.target.value.trim() })}
                  className="meli-field h-12 min-w-0 flex-1 text-[14px] placeholder:text-text-faint"
                />
                <div className="relative w-24 shrink-0">
                  <input
                    aria-label={
                      mode === 'shares'
                        ? en
                          ? `Share for person ${index + 1} (%)`
                          : `Porcentaje para la persona ${index + 1}`
                        : en
                          ? `Amount for person ${index + 1}`
                          : `Monto para la persona ${index + 1}`
                    }
                    placeholder="0"
                    inputMode="decimal"
                    value={mode === 'shares' ? member.share : member.amount}
                    disabled={busy}
                    onChange={(event) =>
                      update(member.id, {
                        [mode === 'shares' ? 'share' : 'amount']: event.target.value.replace(
                          /[^\d.,]/g,
                          '',
                        ),
                      })
                    }
                    className={`meli-field tabular h-12 w-full text-right text-[14px] placeholder:text-text-faint ${mode === 'shares' ? '!pr-7' : ''}`}
                  />
                  {mode === 'shares' ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-text-faint"
                    >
                      %
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-text shrink-0 px-2"
                  aria-label={
                    en ? `Remove person ${index + 1}` : `Quitar a la persona ${index + 1}`
                  }
                  disabled={busy || team.length === 1}
                  onClick={() => setTeam((current) => current.filter(({ id }) => id !== member.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {team.length < MAX_PAYOUTS ? (
            <button
              type="button"
              className="btn-text mt-3"
              disabled={busy}
              onClick={() =>
                setTeam((current) => [
                  ...current,
                  {
                    id: Math.max(-1, ...current.map(({ id }) => id)) + 1,
                    who: '',
                    amount: '',
                    share: '',
                  },
                ])
              }
            >
              {en ? '+ Add a person' : '+ Agregar persona'}
            </button>
          ) : null}
          {vault === 'new' && named.length > 0 ? (
            <button
              type="button"
              disabled={vaultBusy || busy}
              onClick={saveTeam}
              className="mt-1 block min-h-11 text-left text-[13px] font-semibold text-cat-700 underline underline-offset-2 disabled:opacity-50"
            >
              {vaultBusy
                ? en
                  ? 'Confirm on your device…'
                  : 'Confirma en tu dispositivo…'
                : en
                  ? 'Save this team on all my devices'
                  : 'Guardar este equipo en todos mis dispositivos'}
            </button>
          ) : vault === 'open' ? (
            <p className="mt-2 text-[12px] text-growth">
              ✓ {en ? 'Saved on all your devices' : 'Guardado en todos tus dispositivos'}
            </p>
          ) : null}
          {mode === 'shares' && canSave ? (
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="team-save" className="min-w-0 flex-1 text-[14px]">
                {en ? 'To Grow (Aave)' : 'A Crecer (Aave)'}
              </label>
              <div className="relative w-24 shrink-0">
                <input
                  id="team-save"
                  placeholder="0"
                  inputMode="decimal"
                  value={saveShare}
                  disabled={busy}
                  onChange={(event) => setSaveShare(event.target.value.replace(/[^\d.,]/g, ''))}
                  className="meli-field tabular h-12 w-full !pr-7 text-right text-[14px] placeholder:text-text-faint"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-text-faint"
                >
                  %
                </span>
              </div>
              <span className="w-8 shrink-0" aria-hidden="true" />
            </div>
          ) : null}
          <input
            aria-label={en ? 'What it is for (optional)' : 'Concepto (opcional)'}
            placeholder={en ? 'What it is for (optional)' : 'Concepto (opcional)'}
            maxLength={80}
            value={reference}
            disabled={busy}
            onChange={(event) => setReference(event.target.value)}
            className="meli-field mt-4 h-12 text-[14px] placeholder:text-text-faint"
          />
        </MoneyPanel>
        <MoneyPanel className="mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">{en ? 'Pay from' : 'Pagar desde'}</p>
            {others.length > 0 ? (
              <TokenSelect
                value={symbol}
                label={en ? 'Currency' : 'Moneda'}
                options={[
                  { value: 'USDC', symbol: 'USDC', label: 'USD Coin' },
                  ...others.map((asset) => ({
                    value: asset.symbol,
                    symbol: asset.symbol,
                    label: asset.name,
                  })),
                ]}
                onChange={setCoin}
                english={en}
                disabled={busy}
              />
            ) : null}
          </div>
          {canSave && mode === 'amounts' ? (
            <div className="seg-track seg-track-block mb-3">
              {(['available', 'savings'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="seg-item"
                  aria-pressed={from === option}
                  data-active={from === option}
                  onClick={() => setSource(option)}
                >
                  {option === 'available'
                    ? en
                      ? 'Available'
                      : 'Disponible'
                    : en
                      ? 'In Grow'
                      : 'En Crecer'}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[12px] leading-relaxed text-text-muted">
            {from === 'savings'
              ? en
                ? 'What is in Grow keeps earning interest: only what the payments add up to leaves it'
                : 'Lo que tienes en Crecer sigue ganando intereses: solo sale lo que suman los pagos'
              : en
                ? `From the ${symbol} you have available`
                : `Desde los ${symbol} que tienes disponibles`}
            {typeof funds === 'bigint' ? ` (${formatBalance(funds, en)} ${symbol})` : null}.
          </p>
          {from === 'available' && !chosen ? (
            <ElsewhereNote settings={settings} session={session} english={en} className="mt-2" />
          ) : null}
        </MoneyPanel>
        <TransactionActions>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || sum === 0n}>
            {busy
              ? en
                ? 'Preparing…'
                : 'Preparando…'
              : mode === 'shares'
                ? en
                  ? `Review split · ${formatUsdc(sum, en)} ${symbol}`
                  : `Revisar reparto · ${formatUsdc(sum, en)} ${symbol}`
                : en
                  ? `Review payments · ${formatUsdc(sum, en)} ${symbol}`
                  : `Revisar pagos · ${formatUsdc(sum, en)} ${symbol}`}
          </button>
        </TransactionActions>
      </form>
      {review ? (
        <ConfirmSheet
          title={en ? 'Confirm the payments' : 'Confirma los pagos'}
          amountLabel={en ? 'You will move' : 'Vas a mover'}
          amount={formatUsdc(review.total, en)}
          unit={review.symbol}
          warning={
            en
              ? 'Check each person and amount: payments cannot be undone. GatoPago pays the network fee.'
              : 'Revisa cada persona y monto: los pagos no se pueden deshacer. GatoPago paga la comisión de red.'
          }
          confirmLabel={en ? 'Confirm and pay' : 'Confirmar y pagar'}
          english={en}
          busy={busy}
          busyLabel={
            en
              ? 'Confirm on your device. Paying your team…'
              : 'Confirma en tu dispositivo. Pagando a tu equipo…'
          }
          error={error}
          onConfirm={() => confirm(review)}
          onCancel={() => setReview(null)}
        >
          <ConfirmDetails
            rows={[
              ...breakdown(review),
              [
                en ? 'From' : 'Desde',
                review.from === 'savings'
                  ? en
                    ? 'Grow (Aave)'
                    : 'Crecer (Aave)'
                  : en
                    ? 'Available'
                    : 'Disponible',
              ],
              [en ? 'Network' : 'Red', networkName(networkId)],
              ...(reference.trim() ? ([[en ? 'For' : 'Concepto', reference.trim()]] as const) : []),
            ]}
          />
          <SigningDetails
            settings={settings}
            wallet={session.wallet}
            networkId={networkId}
            calls={callsFor(review)}
            english={en}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
