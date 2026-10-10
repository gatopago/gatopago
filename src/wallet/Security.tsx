'use client';

import { useEffect, useState } from 'react';
import { useAction } from './useAction';
import { encodeFunctionData, type Hex } from 'viem';
import { gatopagoAccountAbi, keyOwner, ownersAfter, signApproval } from '@gatopago/shared/wallet';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader } from '../consumer/Primitives';
import { localizedPath } from '../consumer/routes';
import { Sheet } from '../consumer/Sheet';
import { ScreenLoading } from '../consumer/Skeleton';
import { StageOverlay } from '../consumer/StageOverlay';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount, networkName, publicClient } from './account';
import { applyApprovals } from './operations';
import { api } from './api';
import { readKeys, type KeysState } from './keys';
import { failureMessage } from './messages';
import { addOwnerCall, newBackupKey } from './passkey';
import { saveSession, type Session } from './session';
import { approveStellarKey, registerStellarKey, syncStellarSigners } from './stellar';

/**
 * `/settings/security`, as V2's security center: the passkeys that own the account. Adding or
 * removing one is an approval signed once and applied on every network: now where the account
 * exists, later where it is first used.
 */
export function Security({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { wallet } = session;
  const current = keyOwner(wallet.owner).toLowerCase();
  const [state, setState] = useState<KeysState | null>(null);
  const { busy, error, setError, run } = useAction(en);
  const [dialog, setDialog] = useState<{ remove: Hex } | null>(null);

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    readKeys(settings, session)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failureMessage(failure, en));
      });
    return () => {
      active = false;
    };
  }, [settings, session, en, revision, setError]);

  function perform(action: () => Promise<void>) {
    void run(action).then((done) => {
      if (done) setDialog(null);
      // Read the keys again either way: a change may have applied on some networks only.
      setRevision((value) => value + 1);
    });
  }

  /**
   * Signs `call` as the next approval and stores it. It is applied on the home network, where
   * sign-in checks the owners (deploying the account if needed, so a new key works from day one),
   * wherever else the account exists, or on every network when removing a key, so the removed key
   * cannot use a network first.
   */
  async function approve(call: Hex, everywhere: boolean) {
    const account = await gatopagoAccount(settings, wallet, settings.homeNetwork);
    const signature = await signApproval(account, BigInt(state!.total), call);
    const { session: renewed } = await api<{ session?: { token: string; expires_at: number } }>(
      settings.apiOrigin,
      `approvals/${wallet.address}`,
      { token: session.token, body: { call, signature, initial_owners: wallet.initialOwners } },
    );
    // Removing a key ends every earlier session (one may be that key's): this device goes on with
    // the new one. Without one, it removed its own key and its session ended with it.
    const active = renewed
      ? { ...session, token: renewed.token, expiresAt: renewed.expires_at }
      : session;
    if (renewed) saveSession(active);
    // Each network on its own: one that fails does not stop the others, and it applies the change
    // before its next operation anyway.
    const pending: string[] = [];
    for (const id of settings.networks)
      await (async () => {
        if (
          everywhere ||
          id === settings.homeNetwork ||
          (await publicClient(settings, id).getCode({ address: wallet.address }))
        )
          await applyApprovals(settings, active, id);
      })().catch(() => pending.push(id));
    // A removed key must not keep signing on Stellar either; added ones are synced from the list.
    if (everywhere)
      await syncStellarSigners(settings, active, ownersAfter(state!.owners, [call])).catch(() =>
        pending.push('stellar'),
      );
    if (pending.length) throw new Error('APPROVAL_PENDING');
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
      const pending = await approve(call, false).then(
        () => false,
        (failure: unknown) => {
          if (failure instanceof Error && failure.message === 'APPROVAL_PENDING') return true;
          throw failure;
        },
      );
      if (backup.result) {
        await registerStellarKey(settings, session, backup.result);
        await syncStellarSigners(settings, session, ownersAfter(state!.owners, [call])).catch(
          () => undefined,
        );
      }
      if (pending) throw new Error('APPROVAL_PENDING');
    });

  const keyCount = state?.owners.length ?? 0;
  const backedUp = keyCount > 1;
  const removing = dialog && typeof dialog === 'object' ? dialog.remove : null;
  // Where a key change is still to be applied: networks behind the latest approval, or that could
  // not be asked, and Stellar.
  const behind = state
    ? settings.networks.filter((id) => {
        const applied = state.applied[id];
        return applied === 'unread' || (applied !== null && applied < state.total);
      })
    : [];
  const stellarBehind =
    state && settings.stellar && typeof state.stellar === 'number' && state.stellar > 0;
  return (
    <>
      <BackHeader title={en ? 'Security' : 'Seguridad'} english={en} to="/settings" />
      <StageOverlay
        label={
          busy
            ? en
              ? 'Confirm the change on your device…'
              : 'Confirma el cambio en tu dispositivo…'
            : null
        }
        spinner={false}
      />
      {!state && !error ? (
        <ScreenLoading kind="settings" english={en} bar={false} />
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
                  {en ? 'Try again' : 'Reintentar'}
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
                  {en
                    ? `${keyCount} ${keyCount === 1 ? 'key' : 'keys'} · ${backedUp ? 'backed up' : 'no backup'}`
                    : `${keyCount} ${keyCount === 1 ? 'llave' : 'llaves'} · ${backedUp ? 'con respaldo' : 'sin respaldo'}`}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
                  {backedUp
                    ? en
                      ? 'You can sign in with any of them.'
                      : 'Puedes entrar con cualquiera de ellas.'
                    : en
                      ? 'If you lose this device without another key, you lose the account.'
                      : 'Si pierdes este dispositivo sin otra llave, pierdes la cuenta.'}
                </p>
                <button
                  type="button"
                  onClick={() => addKey()}
                  disabled={busy}
                  className={`btn ${backedUp ? 'btn-ghost' : 'btn-primary'} btn-block mt-5`}
                >
                  {busy
                    ? en
                      ? 'Adding…'
                      : 'Agregando…'
                    : backedUp
                      ? en
                        ? 'Add another key'
                        : 'Agregar otra llave'
                      : en
                        ? 'Add a backup key'
                        : 'Agregar llave de respaldo'}
                </button>
                <button
                  type="button"
                  onClick={() => addKey('cross-platform')}
                  disabled={busy}
                  className="btn-text mt-1 min-h-11 w-full text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {en ? 'Use a physical key' : 'Usar una llave física'}
                </button>
              </section>

              <h3 className="meli-kicker mb-3 px-1">{en ? 'Your keys' : 'Tus llaves'}</h3>
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
                          {mine
                            ? en
                              ? 'This device'
                              : 'Este dispositivo'
                            : en
                              ? `Key ${index + 1}`
                              : `Llave ${index + 1}`}
                          <span className="ml-2 font-mono text-[11px] text-text-faint">
                            …{owner.slice(-8)}
                          </span>
                        </p>
                      </div>
                      {mine ? (
                        <span className="shrink-0 text-[12px] text-text-faint">
                          {en ? 'in use' : 'en uso'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDialog({ remove: owner })}
                          className="min-h-11 shrink-0 px-1 text-[13px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {en ? 'Remove' : 'Quitar'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {behind.length || stellarBehind ? (
                <div className="mb-6 divide-y divide-border border border-pending bg-pending/8">
                  {behind.map((id) => (
                    <BehindRow
                      key={id}
                      network={networkName(id)}
                      unread={state.applied[id] === 'unread'}
                      english={en}
                      busy={busy}
                      onApply={() => perform(() => applyApprovals(settings, session, id))}
                    />
                  ))}
                  {stellarBehind && settings.stellar ? (
                    <BehindRow
                      network={networkName(settings.stellar.network)}
                      english={en}
                      busy={busy}
                      onApply={() =>
                        perform(() => syncStellarSigners(settings, session, state.owners))
                      }
                    />
                  ) : null}
                </div>
              ) : state.total > 0 ? (
                <p className="mb-6 px-1 text-[13px] text-growth">
                  ✓ {en ? 'Up to date on all your networks' : 'Al día en todas tus redes'}
                </p>
              ) : (
                <div className="mb-6" />
              )}
            </>
          ) : null}

          <NavigationLink
            href={localizedPath('/settings/security/recovery', en)}
            className="interactive-surface flex min-h-12 items-center justify-between border border-border bg-surface px-4 text-[14px]"
          >
            {en ? 'How keys work' : 'Cómo funcionan las llaves'}
            <span aria-hidden="true" className="font-mono text-text-faint">
              →
            </span>
          </NavigationLink>
        </div>
      )}

      {removing ? (
        <Sheet titleId="remove-key-title" onClose={() => setDialog(null)} busy={busy}>
          <h2 id="remove-key-title" className="font-display text-[22px]">
            {en ? 'Remove this key' : 'Quitar esta llave'}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
            {en
              ? `You are about to remove the key …${removing.slice(-8)} from your account.`
              : `Vas a retirar la llave …${removing.slice(-8)} de tu cuenta.`}
          </p>
          <p className="mt-4 border-l-4 border-danger bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
            {en
              ? 'Once you confirm with an active key, this key can no longer authorize movements.'
              : 'Después de confirmarlo con una llave activa, esta llave ya no podrá autorizar movimientos.'}
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
                  true,
                ),
              )
            }
            className="btn btn-danger btn-block mt-5"
          >
            {busy
              ? en
                ? 'Removing…'
                : 'Quitando…'
              : en
                ? 'Confirm and remove'
                : 'Confirmar y quitar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog(null)}
            className="btn-text mt-1 w-full"
          >
            {en ? 'Cancel' : 'Cancelar'}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

/** A network where the latest key change is still to be applied, with the way to apply it. */
function BehindRow({
  network,
  unread = false,
  english: en,
  busy,
  onApply,
}: {
  network: string;
  /** The network could not be asked: the change may be applied there or not. */
  unread?: boolean;
  english: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-[13px] text-pending">
        {unread
          ? en
            ? `Could not check ${network}`
            : `No pudimos revisar ${network}`
          : en
            ? `Still to apply on ${network}`
            : `Falta aplicar en ${network}`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onApply}
        className="btn btn-primary min-h-10 shrink-0 px-4 text-[12px]"
      >
        {en ? 'Apply' : 'Aplicar'}
      </button>
    </div>
  );
}
