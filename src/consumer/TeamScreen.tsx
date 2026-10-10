'use client';

import { walletAssets } from '@gatopago/shared/assets';
import { useState, type FormEvent } from 'react';
import { useAction } from '../wallet/useAction';
import { useSearchParams } from 'next/navigation';
import { isAddress, isAddressEqual, type Address, type Hex } from 'viem';
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
import { exactUnits, tooPrecise } from '../lib/amount';
import { useFailureMessage } from '../wallet/messages';
import type { ClientSettings } from '../lib/settings';
import { networkName, shortAddress, USDC_DECIMALS } from '../wallet/account';
import { api, type Recipient } from '../wallet/api';
import { formatBalance, formatUsdc, useBalances } from '../wallet/balances';
import { send } from '../wallet/operations';
import type { Group } from '../wallet/groups';
import { useGroups } from './useGroups';
import { ElsewhereNote } from './ElsewhereNote';
import { AmountInput } from './NormalizedInput';
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
import { StageOverlay } from './StageOverlay';
import { useTranslations, useLocale } from 'next-intl';

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
const units = (value: string, decimals: number) => exactUnits(value || '0', decimals);
/** A percentage as typed ("12,5") in basis points. */
const basisPoints = (value: string) => Math.round(Number(value.replace(',', '.') || '0') * 100);

/** A team as it is saved: who, and how much or what share. */
type SavedMember = Pick<Member, 'who' | 'amount' | 'share'>;
const plainTeam = (team: Member[]): SavedMember[] =>
  team.map(({ who, amount, share }) => ({ who, amount, share }));
/**
 * A team as read back from this device or from Wallet Core, or `null` when it is not one: a draft
 * from another version, or edited by hand, starts the form empty instead of breaking the screen.
 */
export function members(list: unknown): Member[] | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const text = (value: unknown) =>
    value === undefined ? '' : typeof value === 'string' ? value : null;
  const team: Member[] = [];
  for (const [id, member] of list.entries()) {
    if (typeof member !== 'object' || member === null) return null;
    const { who, amount, share } = member as Record<string, unknown>;
    const fields = { who: text(who), amount: text(amount), share: text(share) };
    if (fields.who === null || fields.amount === null || fields.share === null) return null;
    team.push({ id, who: fields.who, amount: fields.amount, share: fields.share });
  }
  return team;
}

/** The group paid last from this device, to start from it next time. */
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

/**
 * `/team`, "Group payment": several people paid in one operation and one signature, either fixed
 * amounts (from the available balance or straight from savings in Aave) or shares of an amount
 * that arrived, with a part saved (`/team?split=<amount>` opens it on a paid charge). Every
 * payment goes through or none does.
 */
export function TeamScreen({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('Team');
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
  const { busy, error, run: perform } = useAction();
  // "My groups": named groups kept by Wallet Core, on any device the member signs in.
  const groups = useGroups(settings, session);
  /** The group loaded in the form, if any. */
  const [group, setGroup] = useState<string | null>(null);
  /** The name being typed to save the form as a group; `null` while not saving. */
  const [naming, setNaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savedAs, setSavedAs] = useState('');
  const named = team.filter(({ who }) => who.trim());

  function pickGroup(chosen: Group) {
    const list = members(chosen.members);
    if (list) setTeam(list);
    setGroup(chosen.name);
    setDeleting(false);
    setSavedAs('');
  }
  /** Saves the form as a group: one with the same name is replaced, the others stay. */
  function keepGroup() {
    const name = (naming ?? '').trim();
    if (!name) return;
    void groups.save({ name, members: plainTeam(named) }).then((saved) => {
      if (!saved) return;
      setGroup(name);
      setNaming(null);
      setSavedAs(name);
    });
  }
  function forgetGroup(name: string) {
    void groups.remove(name).then((removed) => {
      if (!removed) return;
      setGroup(null);
      setDeleting(false);
    });
  }
  const saving = t('saving');

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
  const precision = (mode === 'shares' ? [splitting] : team.map(({ amount }) => amount)).some(
    (value) => tooPrecise(value, decimals),
  )
    ? messageFor(new Error('TOO_MANY_DECIMALS'))
    : '';
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
      rememberTeam(account, filled);
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
        counterparty: t('people', { count: current.lines.length }),
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
      (line) => [line.label, `${formatUsdc(line.amount, locale)} ${symbol}`] as const,
    ),
    ...(current.save > 0n
      ? ([[t('growAave'), `${formatUsdc(current.save, locale)} ${symbol}`]] as const)
      : []),
    ...(current.mode === 'shares'
      ? ([[t('staysAvailable'), `${formatUsdc(current.keep, locale)} ${symbol}`]] as const)
      : []),
  ];

  const title = t('groupPayment');
  if (receipt)
    return (
      <>
        <BackHeader title={title} to="/move" />
        <ReceiptScreen receipt={receipt}>
          <ConfirmDetails rows={breakdown(receipt.review)} />
          <NavigationLink href={'/app'} className="btn btn-ghost btn-block mt-4">
            {t('goHome')}
          </NavigationLink>
          <button type="button" className="btn-text mt-1 w-full" onClick={() => setReceipt(null)}>
            {t('payGroupAgain')}
          </button>
        </ReceiptScreen>
      </>
    );

  return (
    <>
      <BackHeader title={title} to="/move" />
      <StageOverlay label={busy && !review && !receipt ? t('preparingPayments') : null} />
      <p className="mb-4 text-[14px] leading-relaxed text-text-muted">
        {t('paySeveralPeopleOnce')}
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
            {option === 'amounts' ? t('fixedAmounts') : t('splitAmount')}
          </button>
        ))}
      </div>
      {(error || precision) && !review ? (
        <p className="auth-error" role="alert">
          {error || precision}
        </p>
      ) : null}
      <form onSubmit={prepare} aria-busy={busy} className="flex flex-1 flex-col">
        {mode === 'shares' ? (
          <MoneyPanel className="mb-5">
            <label className="mb-2 block text-[13px] font-semibold" htmlFor="team-split">
              {t('amountSplit', { symbol })}
            </label>
            <AmountInput
              id="team-split"
              placeholder="0"
              value={splitting}
              disabled={busy}
              onChange={setSplitting}
              className="meli-field tabular h-12 text-[15px] placeholder:text-text-faint"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
              {t('examplePaymentJustReceived')}
            </p>
          </MoneyPanel>
        ) : null}
        <MoneyPanel className="mb-5">
          <p className="text-[13px] font-semibold">{t('whoGetsPaid')}</p>
          <p className="mb-3 text-[12px] text-text-muted">{t('theirGatopagoUsername0x')}</p>
          {groups.failed ? (
            <p role="alert" className="mb-3 text-[12px] leading-relaxed text-pending">
              {t('couldNotLoadGroups')}{' '}
              <button
                type="button"
                onClick={groups.retry}
                className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
              >
                {t('tryAgain')}
              </button>
            </p>
          ) : null}
          {groups.groups.length > 0 ? (
            <div className="mb-3">
              <p className="mb-1.5 text-[12px] text-text-muted">{t('myGroups')}</p>
              <div className="flex flex-wrap gap-2">
                {groups.groups.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    disabled={busy || groups.busy}
                    aria-pressed={item.name === group}
                    onClick={() => pickGroup(item)}
                    className={`min-h-11 max-w-full overflow-hidden text-ellipsis whitespace-nowrap border px-3 text-[13px] ${item.name === group ? 'border-text bg-cat-500/15 font-semibold' : 'border-border bg-surface'}`}
                  >
                    {item.name}{' '}
                    <span className="font-normal text-text-faint">· {item.members.length}</span>
                  </button>
                ))}
              </div>
              {group && groups.groups.some((item) => item.name === group) ? (
                deleting ? (
                  <p className="mt-1 text-[12px]">
                    {t('deleteQuestion', { group })}{' '}
                    <button
                      type="button"
                      disabled={groups.busy}
                      onClick={() => forgetGroup(group)}
                      className="min-h-11 px-1 font-semibold text-danger underline underline-offset-2"
                    >
                      {groups.busy ? t('deleting') : t('yesDelete')}
                    </button>
                    <button
                      type="button"
                      disabled={groups.busy}
                      onClick={() => setDeleting(false)}
                      className="min-h-11 px-1 text-text-muted underline underline-offset-2"
                    >
                      {t('keep')}
                    </button>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy || groups.busy}
                    onClick={() => setDeleting(true)}
                    className="mt-1 min-h-11 text-[12px] text-text-muted underline underline-offset-2"
                  >
                    {t('deleteGroup', { group })}
                  </button>
                )
              ) : null}
            </div>
          ) : null}
          {groups.error ? (
            <p role="alert" className="mb-3 text-[12px] leading-relaxed text-pending">
              {groups.error}
            </p>
          ) : null}
          <RecipientShortcuts
            settings={settings}
            session={session}
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
                  aria-label={t('person', { index: index + 1 })}
                  placeholder={t('username')}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={member.who}
                  disabled={busy}
                  onChange={(event) => update(member.id, { who: event.target.value.trim() })}
                  className="meli-field h-12 min-w-0 flex-1 text-[14px] placeholder:text-text-faint"
                />
                <div className="relative w-24 shrink-0">
                  <AmountInput
                    aria-label={
                      mode === 'shares'
                        ? t('sharePerson', { index: index + 1 })
                        : t('amountPerson', { index: index + 1 })
                    }
                    placeholder="0"
                    value={mode === 'shares' ? member.share : member.amount}
                    disabled={busy}
                    onChange={(next) =>
                      update(member.id, { [mode === 'shares' ? 'share' : 'amount']: next })
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
                  aria-label={t('removePerson', { index: index + 1 })}
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
              {t('addPerson')}
            </button>
          ) : null}
          {named.length > 0 ? (
            naming === null ? (
              <button
                type="button"
                disabled={groups.busy || busy}
                onClick={() => {
                  setNaming(group ?? '');
                  setSavedAs('');
                }}
                className="mt-1 block min-h-11 text-left text-[13px] font-semibold text-cat-700 underline underline-offset-2 disabled:opacity-50"
              >
                {group ? t('saveChanges', { group }) : t('saveGroup')}
              </button>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="group-name" className="basis-full text-[12px] text-text-muted">
                  {t('groupName')}
                </label>
                <input
                  id="group-name"
                  value={naming}
                  maxLength={40}
                  placeholder={t('eGSuppliers')}
                  onChange={(event) => setNaming(event.target.value)}
                  className="meli-field h-11 basis-full text-[14px] placeholder:text-text-faint"
                />
                <button
                  type="button"
                  disabled={groups.busy || busy || !naming.trim()}
                  onClick={keepGroup}
                  className="btn btn-primary btn-sm h-11 shrink-0"
                >
                  {groups.busy ? saving : t('save')}
                </button>
                <button
                  type="button"
                  disabled={groups.busy}
                  onClick={() => setNaming(null)}
                  className="btn-text min-h-11 shrink-0 text-[13px]"
                >
                  {t('cancel')}
                </button>
              </div>
            )
          ) : null}
          {savedAs ? (
            <p role="status" className="mt-2 text-[12px] text-growth">
              ✓ {t('saved', { savedAs })}
            </p>
          ) : null}
          {mode === 'shares' && canSave ? (
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="team-save" className="min-w-0 flex-1 text-[14px]">
                {t('growAave')}
              </label>
              <div className="relative w-24 shrink-0">
                <AmountInput
                  id="team-save"
                  placeholder="0"
                  value={saveShare}
                  disabled={busy}
                  onChange={setSaveShare}
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
            aria-label={t('whatOptional')}
            placeholder={t('whatOptional')}
            maxLength={80}
            value={reference}
            disabled={busy}
            onChange={(event) => setReference(event.target.value)}
            className="meli-field mt-4 h-12 text-[14px] placeholder:text-text-faint"
          />
        </MoneyPanel>
        <MoneyPanel className="mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">{t('pay')}</p>
            {others.length > 0 ? (
              <TokenSelect
                value={symbol}
                label={t('currency')}
                options={[
                  { value: 'USDC', symbol: 'USDC', label: 'USD Coin' },
                  ...others.map((asset) => ({
                    value: asset.symbol,
                    symbol: asset.symbol,
                    label: asset.name,
                  })),
                ]}
                onChange={setCoin}
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
                  {option === 'available' ? t('available') : t('grow')}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[12px] leading-relaxed text-text-muted">
            {from === 'savings' ? t('whatGrowKeepsEarning') : t('fromAvailable', { symbol })}
            {typeof funds === 'bigint' ? ` (${formatBalance(funds, locale)} ${symbol})` : null}.
          </p>
          {from === 'available' && !chosen ? (
            <ElsewhereNote settings={settings} session={session} className="mt-2" />
          ) : null}
        </MoneyPanel>
        <TransactionActions>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || sum === 0n}>
            {busy
              ? t('preparing')
              : mode === 'shares'
                ? t('reviewSplit', { sum: formatUsdc(sum, locale), symbol })
                : t('reviewPayments', { sum: formatUsdc(sum, locale), symbol })}
          </button>
        </TransactionActions>
      </form>
      {review ? (
        <ConfirmSheet
          title={t('confirmPayments')}
          amountLabel={t('move')}
          amount={formatUsdc(review.total, locale)}
          unit={review.symbol}
          warning={t('checkEachPersonAmount')}
          confirmLabel={t('confirmPay')}
          busy={busy}
          busyLabel={t('confirmDevicePayingGroup')}
          error={error}
          onConfirm={() => confirm(review)}
          onCancel={() => setReview(null)}
        >
          <ConfirmDetails
            rows={[
              ...breakdown(review),
              [t('from'), review.from === 'savings' ? t('growAaveShort') : t('available')],
              [t('network'), networkName(networkId)],
              ...(reference.trim() ? ([[t('for'), reference.trim()]] as const) : []),
            ]}
          />
          <SigningDetails wallet={session.wallet} networkId={networkId} calls={callsFor(review)} />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
