'use client';

import { useEffect, useState } from 'react';
import { useAction } from './useAction';
import { decodeFunctionData, encodeFunctionData, type Hex } from 'viem';
import {
  approvedOwners,
  cancelChangeCall,
  gatopagoAccountAbi,
  keyOwner,
  signApproval,
} from '@gatopago/shared/wallet';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader } from '../consumer/Primitives';
import { Sheet } from '../consumer/Sheet';
import { ScreenLoading } from '../consumer/Skeleton';
import { StageOverlay } from '../consumer/StageOverlay';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount, networkName } from './account';
import { applyApprovals, changesToApply, send } from './operations';
import { api, type OwnerChange } from './api';
import { readKeys, type KeysState } from './keys';
import { useFailureMessage } from './messages';
import { addOwnerCall, newBackupKey } from './passkey';
import type { Session } from './session';
import { approveStellarKey, registerStellarKey, syncStellarSigners } from './stellar';
import { useLocale, useTranslations } from 'next-intl';
import { BusinessAccess } from '../consumer/BusinessAccess';

/**
 * `/settings/security`, as V2's security center: the passkeys that own the account. Adding or
 * removing one is an approval signed once and applied at once on every network. A removal waits two
 * days on each, listed here, where any key cancels it.
 */
export function Security({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const t = useTranslations('Security');
  const locale = useLocale();
  const { wallet } = session;
  const current = keyOwner(wallet.owner).toLowerCase();
  const [state, setState] = useState<KeysState | null>(null);
  const { busy, error, setError, run } = useAction();
  const [dialog, setDialog] = useState<{ remove: Hex } | null>(null);

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    readKeys(settings, session)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(messageFor(failure));
      });
    return () => {
      active = false;
    };
  }, [settings, session, messageFor, revision, setError]);

  function perform(action: () => Promise<void>) {
    void run(action).then((done) => {
      if (done) setDialog(null);
      // Read the keys again either way: a change may have applied on some networks only.
      setRevision((value) => value + 1);
    });
  }

  /**
   * Signs `call` as the next approval, stores it and applies it on every network at once, deploying
   * the account where it does not exist yet: an approval left for later could be taken there first
   * by a stolen key. A network that fails gets it again before its next operation.
   */
  async function approve(call: Hex) {
    const account = await gatopagoAccount(settings, wallet, settings.homeNetwork);
    const signature = await signApproval(account, BigInt(state!.total), call);
    await api(settings.apiOrigin, `approvals/${wallet.address}`, {
      token: session.token,
      body: { call, signature, initial_owners: wallet.initialOwners },
    });
    const pending: string[] = [];
    for (const id of settings.networks)
      await applyApprovals(settings, session, id).catch(() => pending.push(id));
    if (pending.length) throw new Error('APPROVAL_PENDING');
  }

  /** Cancels a scheduled change on every network where it waits: one operation on each. */
  async function cancel(change: ScheduledChange) {
    const pending: string[] = [];
    for (const id of change.networks)
      await send(settings, session, id, [cancelChangeCall(wallet.address, change.id)]).catch(() =>
        pending.push(id),
      );
    if (pending.length) throw new Error('CANCEL_PENDING');
  }

  /**
   * Adds a backup key: a new passkey whose Mera key becomes an owner (its user handle names this
   * account, so any device finds it). Its Stellar key is approved by its own EVM key while the new
   * passkey's keys are in memory, registered once the approval made that key an owner, and signed
   * in on Stellar by this device.
   */
  const addKey = (attachment?: AuthenticatorAttachment) =>
    perform(async () => {
      const backup = await newBackupKey(
        settings,
        wallet.address,
        (keys) => approveStellarKey(settings, wallet.address, keys),
        attachment,
      );
      const call = addOwnerCall(backup.owner);
      // Still pending on some networks: the key is approved, and it completes there later.
      const pending = await approve(call).then(
        () => false,
        (failure: unknown) => {
          if (failure instanceof Error && failure.message === 'APPROVAL_PENDING') return true;
          throw failure;
        },
      );
      if (backup.result) {
        await registerStellarKey(settings, session, backup.result);
        await syncStellarSigners(settings, session, approvedOwners(state!.owners, [call])).catch(
          () => undefined,
        );
      }
      if (pending) throw new Error('APPROVAL_PENDING');
    });

  const keyCount = state?.owners.length ?? 0;
  const backedUp = keyCount > 1;
  const removing = dialog && typeof dialog === 'object' ? dialog.remove : null;
  // Where a key change is still to be applied: networks behind the latest approval, or that could
  // not be asked, or with a removal due, and Stellar.
  const behind = state
    ? settings.networks.filter((id) => {
        const applied = state.applied[id];
        return (
          applied === 'unread' ||
          (applied !== null && applied < state.total) ||
          changesToApply(wallet, state.changes, id, state.readAt).length > 0
        );
      })
    : [];
  const scheduled = state ? scheduledChanges(state.changes) : [];
  const stellarBehind =
    state && settings.stellar && typeof state.stellar === 'number' && state.stellar > 0;
  return (
    <>
      <BackHeader title={t('security')} to="/settings" />
      <StageOverlay label={busy ? t('confirmChangeDevice') : null} spinner={false} />
      {!state && !error ? (
        <ScreenLoading kind="settings" bar={false} />
      ) : (
        <div>
          {error ? (
            <div className="mb-6 border-2 border-pending bg-pending/10 p-4" role="alert">
              <p className="font-display text-[15px] text-pending">{error}</p>
              {!state ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setRevision((value) => value + 1);
                  }}
                  className="btn btn-ghost mt-3 min-h-10 px-4 text-[12px]"
                >
                  {t('tryAgain')}
                </button>
              ) : null}
            </div>
          ) : null}

          {state ? (
            <>
              <section
                className="meli-paper-card meli-paper-card--strong mb-6 p-5"
                aria-labelledby="security-status"
              >
                <h2
                  id="security-status"
                  className={`flex items-center gap-2.5 font-display text-[19px] ${backedUp ? 'text-growth' : 'text-pending'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center text-[15px] font-bold ${backedUp ? 'bg-growth/15' : 'bg-pending/15'}`}
                  >
                    {backedUp ? '✓' : '!'}
                  </span>
                  {t('keysSummary', { count: keyCount, backedUp: String(backedUp) })}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
                  {backedUp ? t('signAnyThem') : t('ifLoseDeviceWithout')}
                </p>
                <button
                  type="button"
                  onClick={() => addKey()}
                  disabled={busy}
                  className={`btn ${backedUp ? 'btn-ghost' : 'btn-primary'} btn-block mt-5`}
                >
                  {busy ? t('adding') : backedUp ? t('addAnotherKey') : t('addBackupKey')}
                </button>
                <button
                  type="button"
                  onClick={() => addKey('cross-platform')}
                  disabled={busy}
                  className="btn-text mt-1 min-h-11 w-full text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('usePhysicalKey')}
                </button>
              </section>

              <h3 className="meli-kicker mb-3 px-1">{t('keys')}</h3>
              <div className="meli-paper-card mb-3 divide-y divide-border">
                {state.owners.map((owner, index) => {
                  const mine = owner.toLowerCase() === current;
                  return (
                    <div
                      key={owner}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px]">
                          {mine ? t('device') : t('key', { index: index + 1 })}
                          <span className="ml-2 font-mono text-[11px] text-text-faint">
                            …{owner.slice(-8)}
                          </span>
                        </p>
                      </div>
                      {mine ? (
                        <span className="shrink-0 text-[12px] text-text-faint">{t('use')}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDialog({ remove: owner })}
                          className="min-h-11 shrink-0 px-1 text-[13px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t('remove')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {scheduled.length ? (
                <>
                  <h3 className="meli-kicker mb-3 px-1">{t('scheduled')}</h3>
                  <div className="meli-paper-card mb-3 divide-y divide-border">
                    {scheduled.map((change) => (
                      <div
                        key={change.id}
                        className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px]">
                            {change.removes
                              ? t('removesKey', { value: change.removes })
                              : t('changesContract')}
                          </p>
                          <p className="text-[12px] text-text-faint">
                            {change.readyAt <= state.readAt
                              ? t('changeReady')
                              : t('changeAppliesOn', {
                                  date: new Date(change.readyAt * 1000).toLocaleString(locale, {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }),
                                })}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => perform(() => cancel(change))}
                          className="min-h-11 shrink-0 px-1 text-[13px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {behind.length || stellarBehind ? (
                <div className="mb-6 divide-y divide-border border border-pending bg-pending/8">
                  {behind.map((id) => (
                    <BehindRow
                      key={id}
                      network={networkName(id)}
                      unread={state.applied[id] === 'unread'}
                      busy={busy}
                      onApply={() => perform(() => applyApprovals(settings, session, id))}
                    />
                  ))}
                  {stellarBehind && settings.stellar ? (
                    <BehindRow
                      network={networkName(settings.stellar.network)}
                      busy={busy}
                      onApply={() =>
                        perform(() => syncStellarSigners(settings, session, state.owners))
                      }
                    />
                  ) : null}
                </div>
              ) : state.total > 0 ? (
                <p className="mb-6 px-1 text-[13px] text-growth">✓ {t('upDateAllNetworks')}</p>
              ) : (
                <div className="mb-6" />
              )}
            </>
          ) : null}

          <BusinessAccess settings={settings} session={session} />

          <NavigationLink
            href={'/settings/security/recovery'}
            className="interactive-surface flex min-h-12 items-center justify-between border border-border bg-surface px-4 text-[14px]"
          >
            {t('howKeysWork')}
            <span aria-hidden="true" className="font-mono text-text-faint">
              →
            </span>
          </NavigationLink>
        </div>
      )}

      {removing ? (
        <Sheet titleId="remove-key-title" onClose={() => setDialog(null)} busy={busy}>
          <h2 id="remove-key-title" className="font-display text-[22px]">
            {t('removeKey')}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
            {t('aboutRemoveKeyAccount', { value: removing.slice(-8) })}
          </p>
          <p className="mt-4 border-l-4 border-danger bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
            {t('onceConfirmActiveKey')}
          </p>
          {error ? (
            <p className="mt-3 text-[12px] leading-relaxed text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              perform(() =>
                approve(
                  encodeFunctionData({
                    abi: gatopagoAccountAbi,
                    functionName: 'removeOwners',
                    args: [[removing]],
                  }),
                ),
              )
            }
            className="btn btn-danger btn-block mt-5"
          >
            {busy ? t('removing') : t('confirmRemove')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog(null)}
            className="btn-text mt-1 w-full"
          >
            {t('cancel')}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

/** A change scheduled on one or more networks (the same approval on each), as Security lists it. */
type ScheduledChange = {
  id: Hex;
  networks: string[];
  /** When the last network lets it apply. */
  readyAt: number;
  /** The keys it removes (their last characters), or null for an upgrade. */
  removes: string | null;
};

function scheduledChanges(changes: readonly OwnerChange[]): ScheduledChange[] {
  const byId = new Map<Hex, ScheduledChange>();
  for (const change of changes) {
    const known = byId.get(change.id);
    if (known) {
      known.networks.push(change.network);
      known.readyAt = Math.max(known.readyAt, change.ready_at);
      continue;
    }
    const { functionName, args } = decodeFunctionData({
      abi: gatopagoAccountAbi,
      data: change.call,
    });
    byId.set(change.id, {
      id: change.id,
      networks: [change.network],
      readyAt: change.ready_at,
      removes:
        functionName === 'removeOwners'
          ? (args[0] as readonly Hex[]).map((owner) => `…${owner.slice(-8)}`).join(', ')
          : null,
    });
  }
  return [...byId.values()];
}

/** A network where the latest key change is still to be applied, with the way to apply it. */
function BehindRow({
  network,
  unread = false,
  busy,
  onApply,
}: {
  network: string;
  /** The network could not be asked: the change may be applied there or not. */
  unread?: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const t = useTranslations('Security');
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-[13px] text-pending">
        {unread ? t('couldNotCheck', { network }) : t('stillApply', { network })}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onApply}
        className="btn btn-primary min-h-10 shrink-0 px-4 text-[12px]"
      >
        {t('apply')}
      </button>
    </div>
  );
}
