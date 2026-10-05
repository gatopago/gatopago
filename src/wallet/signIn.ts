import { walletNetwork } from '@gatopago/shared/networks';
import { createSiweMessage } from 'viem/siwe';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount } from './account';
import { api } from './api';
import { saveSession, type Session, type Wallet } from './session';

/**
 * Sign-In with Ethereum (ERC-4361): the account signs the message with its passkey (ERC-1271, or
 * ERC-6492 before it is deployed). A new account also sends its invitation and Turnstile token.
 */
export async function signIn(
  settings: ClientSettings,
  wallet: Wallet,
  signUp?: { invite: string; turnstile: string },
): Promise<Session> {
  const networkId = settings.networks[0];
  const account = await gatopagoAccount(wallet, networkId);
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
    { body: { message, signature, ...signUp } },
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
