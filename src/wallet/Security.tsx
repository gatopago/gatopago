'use client';

import { useEffect, useState } from 'react';
import { encodeFunctionData, type Hex } from 'viem';
import { walletContracts } from '@gatopago/shared/networks';
import {
  gatopagoAccountAbi,
  ownersAfter,
  passkeyOwner,
  signApproval,
} from '@gatopago/shared/wallet';
import { Panel } from '../consumer/Primitives';
import type { ClientSettings } from '../lib/settings';
import {
  applyApprovals,
  appliedApprovals,
  gatopagoAccount,
  networkName,
  publicClient,
} from './account';
import { api, type Approvals } from './api';
import { failureMessage } from './messages';
import { createPasskey } from './passkey';
import type { Session, Wallet } from './session';

type State = { owners: Hex[]; total: number; applied: Record<string, number | null> };

/**
 * The passkeys that own the account. Adding or removing one is an approval signed once and
 * applied on every network: now where the account exists, later where it is first used.
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
  const current = passkeyOwner(walletContracts.webAuthnVerifier, wallet.publicKey).toLowerCase();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    readKeys(settings, wallet)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failureMessage(failure, en));
      });
    return () => {
      active = false;
    };
  }, [settings, wallet, en, revision]);

  function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    action()
      .then(() => setRevision((value) => value + 1))
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  /**
   * Signs `call` as the next approval and stores it. It is applied where the account exists, or on
   * every network when removing a key, so the removed key cannot use a network first.
   */
  async function approve(call: Hex, everywhere: boolean) {
    const account = await gatopagoAccount(wallet, settings.networks[0]);
    const signature = await signApproval(account, BigInt(state!.total), call);
    await api(settings.apiOrigin, `approvals/${wallet.address}`, {
      token: session.token,
      body: { call, signature, initial_owners: wallet.initialOwners },
    });
    for (const id of settings.networks)
      if (everywhere || (await publicClient(id).getCode({ address: wallet.address })))
        await applyApprovals(settings, session, id);
  }

  return (
    <>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {!state ? (
        error ? null : (
          <p role="status">{en ? 'Loading your keys…' : 'Cargando tus llaves…'}</p>
        )
      ) : (
        <>
          <Panel>
            <h2 className="mb-3 font-display text-lg">{en ? 'Your keys' : 'Tus llaves'}</h2>
            <ul>
              {state.owners.map((owner, index) => {
                const mine = owner.toLowerCase() === current;
                return (
                  <li key={owner} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {mine
                        ? en
                          ? 'This key'
                          : 'Esta llave'
                        : `${en ? 'Key' : 'Llave'} ${index + 1}`}
                      <span className="ml-2 font-mono text-xs text-text-muted">
                        …{owner.slice(-8)}
                      </span>
                    </span>
                    {!mine ? (
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={busy}
                        onClick={() =>
                          perform(() =>
                            approve(
                              encodeFunctionData({
                                abi: gatopagoAccountAbi,
                                functionName: 'removeOwners',
                                args: [[owner]],
                              }),
                              true,
                            ),
                          )
                        }
                      >
                        {en ? 'Remove' : 'Quitar'}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="auth-primary btn btn-primary btn-block mt-4"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  const backup = await createPasskey('GatoPago backup', wallet.address);
                  await approve(
                    encodeFunctionData({
                      abi: gatopagoAccountAbi,
                      functionName: 'addOwners',
                      args: [[passkeyOwner(walletContracts.webAuthnVerifier, backup.publicKey)]],
                    }),
                    false,
                  );
                })
              }
            >
              {busy
                ? en
                  ? 'Working…'
                  : 'Procesando…'
                : en
                  ? 'Add a backup key'
                  : 'Agregar una llave de respaldo'}
            </button>
            <p className="mt-3 text-sm text-text-muted">
              {en
                ? 'Save it in another password manager or on a security key. Every key has full control of the account.'
                : 'Guárdala en otro gestor de contraseñas o en una llave física. Cada llave tiene control total de la cuenta.'}
            </p>
          </Panel>
          {state.total > 0 ? (
            <Panel>
              <h2 className="mb-3 font-display text-lg">{en ? 'Networks' : 'Redes'}</h2>
              <ul>
                {settings.networks.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 py-2">
                    <span>{networkName(id)}</span>
                    {state.applied[id] === null ? (
                      <span className="text-sm text-text-muted">
                        {en ? 'Applied on first use' : 'Se aplica al primer uso'}
                      </span>
                    ) : state.applied[id] >= state.total ? (
                      <span className="text-sm text-text-muted">
                        {en ? 'Up to date' : 'Al día'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={busy}
                        onClick={() => perform(() => applyApprovals(settings, session, id))}
                      >
                        {en ? 'Apply changes' : 'Aplicar cambios'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-text-muted">
                {en
                  ? 'Key changes apply on a network automatically the next time you send there.'
                  : 'Los cambios de llaves se aplican en una red automáticamente la próxima vez que envías ahí.'}
              </p>
            </Panel>
          ) : null}
        </>
      )}
    </>
  );
}

async function readKeys(settings: ClientSettings, wallet: Wallet): Promise<State> {
  const { approvals } = await api<Approvals>(settings.apiOrigin, `approvals/${wallet.address}`);
  const applied = await Promise.all(
    settings.networks.map((id) => appliedApprovals(wallet.address, id)),
  );
  return {
    owners: ownersAfter(
      wallet.initialOwners,
      approvals.map((approval) => approval.call),
    ),
    total: approvals.length,
    applied: Object.fromEntries(settings.networks.map((id, i) => [id, applied[i]])),
  };
}
