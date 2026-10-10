import { walletNetwork } from '@gatopago/shared/networks';
import { createSiweMessage } from 'viem/siwe';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount } from './account';
import { api, ApiError } from './api';
import { findAnyWallet } from './passkey';
import { saveSession, type Session, type Wallet } from './session';

/**
 * Signs in with whichever passkey the person picks: one prompt. An account Wallet Core does not
 * know (its database was reset) signs up again with the same passkey: `human` gives a Turnstile
 * token and the open Mera session signs again without another prompt. While sign-up needs an
 * invitation (`INVITE_ONLY`), it ends in `INVITE_REQUIRED` instead.
 */
export async function enter(
  settings: ClientSettings,
  human: () => Promise<string>,
): Promise<Session> {
  const wallet = await findAnyWallet(settings);
  try {
    return await signIn(settings, wallet);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'TURNSTILE_REQUIRED') throw error;
    return signIn(settings, wallet, { turnstile: await human() });
  }
}

/**
 * Sign-In with Ethereum (ERC-4361): the account signs the message with its passkey (ERC-1271, or
 * ERC-6492 before it is deployed). A new account also sends its Turnstile token and, unless sign-up
 * is open, its invitation.
 */
export async function signIn(
  settings: ClientSettings,
  wallet: Wallet,
  signUp?: { invite?: string; turnstile: string },
): Promise<Session> {
  const networkId = settings.homeNetwork;
  const account = await gatopagoAccount(settings, wallet, networkId);
  const { nonce } = await api<{ nonce: string }>(settings.apiOrigin, 'auth/nonce', {
    method: 'POST',
  });
  const message = createSiweMessage({
    domain: new URL(settings.webOrigin).host,
    uri: settings.webOrigin,
    address: account.address,
    chainId: walletNetwork(networkId).chain.id,
    nonce,
    version: '1',
    issuedAt: new Date(),
    statement: 'Sign in to GatoPago.',
  });
  const signature = await account.signMessage({ message });
  const result = await api<{ token: string; expires_at: number; user_id: string }>(
    settings.apiOrigin,
    'auth/session',
    // Its initial owners: Wallet Core checks the signer against the account's owners now.
    { body: { message, signature, initial_owners: wallet.initialOwners, ...signUp } },
  );
  const session = {
    token: result.token,
    expiresAt: result.expires_at,
    userId: result.user_id,
    wallet,
  };
  saveSession(session);
  return session;
}
