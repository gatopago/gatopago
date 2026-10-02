import { profileClient, resolveUsername } from '../wallet/profile';
import { getApps, initializeApp } from 'firebase/app';
import {
  initializeAuth, browserLocalPersistence, connectAuthEmulator, onIdTokenChanged, signInWithCustomToken, signOut, type User,
} from 'firebase/auth';
import { assertBrowserOrigin, LOCAL_AUTH_ORIGIN, type EnabledAuthConfig } from './config';
import { passkeyClient, AccessError } from './passkey-client';
import { holdPageReload } from '../pwa/reload-guard';
import { loadWalletPage, WalletCoreError } from '../wallet/core';
import { prepareEnrollment, completeEnrollment, type EnrollmentSubmission } from '../wallet/enrollment';
import { loadCredentialInventory } from '../wallet/credentials';
import type { initializationClient } from '../wallet/initialization';
import type { creationOperationClient } from '../wallet/creation-operation';
import { creationProfileForRelease } from '../wallet/creation-release';
import { accountPinsForRelease } from '../wallet/account-release';

export type Identity = { uid: string };
export type BrowserAuth = ReturnType<typeof createBrowserAuth>;
const identity = (user: User | null): Identity | null => user ? { uid: user.uid } : null;

// Browser lifetime only, initialized from an effect. Never holds an SSR request/user.
let instance: { key: string; runtime: BrowserAuth } | undefined;

export function getBrowserAuth(config: EnabledAuthConfig): BrowserAuth {
  if (typeof window === 'undefined') throw new Error('Firebase browser auth cannot run on the server');
  assertBrowserOrigin(config, window.location.origin);
  const key = JSON.stringify(config);
  if (instance && instance.key !== key) throw new Error('Auth environment changed; reload required');
  if (!instance) instance = { key, runtime: createBrowserAuth(config) };
  return instance.runtime;
}

function createBrowserAuth(config: EnabledAuthConfig) {
  // An existing SDK app without its runtime indicates HMR/config drift. Do not silently reuse it.
  if (getApps().some((app) => app.name === 'gatopago-v3')) throw new Error('Reload the auth page');
  const app = initializeApp(config.firebase, 'gatopago-v3');
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
  });
  if (config.mode === 'emulator') connectAuthEmulator(auth, LOCAL_AUTH_ORIGIN);
  const releaseReady = holdPageReload();
  const ready = (async () => {
    await auth.authStateReady();
  })().finally(releaseReady);
  // Observe immediately to prevent an unhandled rejection while the component mounts.
  void ready.catch(() => undefined);
  let inFlight: Promise<unknown> | null = null;
  const access = passkeyClient(config);
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (inFlight) return Promise.reject(Object.assign(new Error('Auth operation pending'), { code: 'auth/busy' }));
    const release = holdPageReload();
    let result: Promise<T>;
    try { result = operation(); }
    catch (error) { release(); return Promise.reject(error); }
    inFlight = result;
    void result.finally(() => { if (inFlight === result) inFlight = null; release(); }).catch(() => undefined);
    return result;
  }
  function assertSignedOut() {
    if (auth.currentUser) throw new AccessError('auth/session-changed');
  }
  async function startSession(token: string, signal: AbortSignal) {
    signal.throwIfAborted(); assertSignedOut();
    // Firebase exchange is not abortable. Once started, settle it and let the
    // auth observer reflect the result; never automatically repeat an admission.
    await signInWithCustomToken(auth, token);
  }
  function captureSession(expectedUid: string) {
    const user = auth.currentUser;
    const assertCurrent = () => {
      if (!user || auth.currentUser !== user || user.uid !== expectedUid) throw new WalletCoreError('auth/session-changed');
    };
    assertCurrent();
    const token = async () => {
      assertCurrent();
      const value = await user!.getIdToken();
      assertCurrent(); return value;
    };
    return { assertCurrent, token };
  }
  return {
    ready,
    current: () => identity(auth.currentUser),
    subscribe: (callback: (user: Identity | null) => void) => onIdTokenChanged(auth, (user) => callback(identity(user))),
    profile: (expectedUid: string) => {
      const session = captureSession(expectedUid), client = profileClient(config, session.token, expectedUid);
      return { assertCurrent: session.assertCurrent,
        read: async (signal: AbortSignal) => { session.assertCurrent(); const result = await client.read(signal); session.assertCurrent(); return result; },
        rename: async (name: string, signal: AbortSignal) => { session.assertCurrent(); const result = await client.rename(name, signal); session.assertCurrent(); return result; },
        publish: async (username: string, wallet: string, account: string, signal: AbortSignal) => {
          session.assertCurrent(); const result = await client.publish(username, wallet, account, signal); session.assertCurrent(); return result;
        },
      };
    },
    recipientNetworks: () => config.mode === 'firebase' ? [...config.deployment.wallet_enabled] : [],
    recipient: async (expectedUid: string, username: string, network: string, signal: AbortSignal) => {
      const session = captureSession(expectedUid); session.assertCurrent();
      const result = await resolveUsername(config.deployment, username, network, signal); session.assertCurrent(); return result;
    },
    initializationProfile: () => config.mode === 'firebase' ? creationProfileForRelease(config.deployment) : null,
    accountContexts: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      const pins = config.mode === 'firebase' ? accountPinsForRelease(config.deployment) : [];
      return {
        assertCurrent: session.assertCurrent, environment: config.deployment,
        read: async (selected: import('../wallet/balances').AccountChoice, signal: AbortSignal) => {
          const expected = structuredClone(selected); session.assertCurrent();
          const { accountContextClient } = await import('../wallet/account-context'); session.assertCurrent();
          const result = await accountContextClient(config, session.token, pins).read(expected, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    transferPreparations: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      const load = async (selected: import('../wallet/transfer-preparation').TransferSelection,
        request: import('@gatopago/shared/v3/transfer').TransferRequest, signal: AbortSignal, id?: string) => {
        const expected = structuredClone(selected), input = structuredClone(request);
        session.assertCurrent();
        const { transferPreparationClient } = await import('../wallet/transfer-preparation'); session.assertCurrent();
        const client = transferPreparationClient(config, session.token);
        const result = id === undefined ? await client.prepare(expected, input, signal) : await client.read(expected, input, id, signal);
        session.assertCurrent(); return result;
      };
      return { assertCurrent: session.assertCurrent,
        prepare: (selected: import('../wallet/transfer-preparation').TransferSelection,
          request: import('@gatopago/shared/v3/transfer').TransferRequest, signal: AbortSignal) => load(selected, request, signal),
        read: (selected: import('../wallet/transfer-preparation').TransferSelection,
          request: import('@gatopago/shared/v3/transfer').TransferRequest, id: string, signal: AbortSignal) => load(selected, request, signal, id) };
    },
    transferCommands: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        confirm: async (selected: import('../wallet/transfer-preparation').TransferSelection,
          request: import('@gatopago/shared/v3/transfer').TransferRequest, review: import('../wallet/transfer-command').TransferReview,
          proofs: import('../wallet/transfer-command').TransferProofs, signal: AbortSignal) => {
          const snapshot = structuredClone({ selected, request, review, proofs }); session.assertCurrent();
          const { transferCommandClient } = await import('../wallet/transfer-command'); session.assertCurrent();
          const result = await transferCommandClient(config,session.token).confirm(snapshot.selected,snapshot.request,snapshot.review,snapshot.proofs,signal);
          session.assertCurrent(); return result;
        },
        deliver: async (selected: import('../wallet/transfer-preparation').TransferSelection,
          request: import('@gatopago/shared/v3/transfer').TransferRequest, review: import('../wallet/transfer-command').TransferReview,
          confirmation: unknown, signal: AbortSignal) => {
          const snapshot = structuredClone({ selected, request, review, confirmation }); session.assertCurrent();
          const { transferCommandClient } = await import('../wallet/transfer-command'); session.assertCurrent();
          const result = await transferCommandClient(config,session.token).deliver(snapshot.selected,snapshot.request,snapshot.review,snapshot.confirmation,signal);
          session.assertCurrent(); return result;
        },
      };
    },
    transferRestoration: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        restore: async (selected: import('../wallet/transfer-preparation').TransferSelection,
          bookmark: import('../wallet/transfer-bookmark').TransferBookmark, signal: AbortSignal) => {
          const snapshot = structuredClone({ selected, bookmark }); session.assertCurrent();
          const { transferRestorationClient } = await import('../wallet/transfer-restoration'); session.assertCurrent();
          const result = await transferRestorationClient(config, session.token).restore(snapshot.selected, snapshot.bookmark, signal);
          session.assertCurrent(); return result;
        },
        deliver: async (selected: import('../wallet/transfer-preparation').TransferSelection,
          bookmark: import('../wallet/transfer-bookmark').TransferBookmark, wire: unknown, signal: AbortSignal) => {
          const snapshot = structuredClone({ selected, bookmark, wire }); session.assertCurrent();
          const { transferRestorationClient } = await import('../wallet/transfer-restoration'); session.assertCurrent();
          const result = await transferRestorationClient(config, session.token).deliver(snapshot.selected, snapshot.bookmark, snapshot.wire, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    transfers: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        status: async (selected: import('../wallet/transfers').TransferLocator, signal: AbortSignal) => {
          const expected = { ...selected };
          session.assertCurrent();
          const { transferClient } = await import('../wallet/transfers'); session.assertCurrent();
          const result = await transferClient(config, session.token).status(expected, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    balances: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        accounts: async (walletId: string, after: string | null, signal: AbortSignal) => {
          session.assertCurrent();
          const { balanceClient } = await import('../wallet/balances'); session.assertCurrent();
          const result = await balanceClient(config, session.token).accounts(walletId, after, signal);
          session.assertCurrent(); return result;
        },
        read: async (selected: import('../wallet/balances').AccountChoice, signal: AbortSignal) => {
          session.assertCurrent();
          const { balanceClient } = await import('../wallet/balances'); session.assertCurrent();
          const result = await balanceClient(config, session.token).read(selected, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    creationOperation: async (expectedUid: string, pin: Parameters<typeof creationOperationClient>[2]) => {
      const session = captureSession(expectedUid), trusted = Object.freeze({ ...pin });
      const { creationOperationClient: createClient } = await import('../wallet/creation-operation');
      session.assertCurrent();
      const client = createClient(config, session.token, trusted);
      return {
        assertCurrent: session.assertCurrent,
        prepare: async (...args: Parameters<typeof client.prepare>) => {
          session.assertCurrent(); const result = await client.prepare(...args); session.assertCurrent(); return result;
        },
        restore: async (...args: Parameters<typeof client.restore>) => {
          session.assertCurrent(); const result = await client.restore(...args); session.assertCurrent(); return result;
        },
        authorize: async (...args: Parameters<typeof client.authorize>) => {
          session.assertCurrent(); const result = await client.authorize(...args); session.assertCurrent(); return result;
        },
      };
    },
    initialization: async (expectedUid: string, pin: Parameters<typeof initializationClient>[2]) => {
      const session = captureSession(expectedUid);
      const trusted = Object.freeze({ ...pin });
      // Loading/preparing is not a WebAuthn gesture. Keep this code out of the auth
      // bootstrap; the subsequent confirmation button invokes the passkey directly.
      const { initializationClient: createClient } = await import('../wallet/initialization');
      session.assertCurrent();
      const client = createClient(config, session.token, trusted);
      return {
        assertCurrent: session.assertCurrent,
        history: async (...args: Parameters<typeof client.history>) => {
          session.assertCurrent(); const result = await client.history(...args); session.assertCurrent(); return result;
        },
        restore: async (...args: Parameters<typeof client.restore>) => {
          session.assertCurrent(); const result = await client.restore(...args); session.assertCurrent(); return result;
        },
        prepare: async (...args: Parameters<typeof client.prepare>) => {
          session.assertCurrent(); const result = await client.prepare(...args); session.assertCurrent(); return result;
        },
        authorize: async (...args: Parameters<typeof client.authorize>) => {
          session.assertCurrent(); const result = await client.authorize(...args); session.assertCurrent(); return result;
        },
      };
    },
    credentialInventory: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        read: async (signal: AbortSignal) => {
          session.assertCurrent();
          const result = await loadCredentialInventory(config, session.token, signal);
          session.assertCurrent(); return result;
        },
        detail: async (reference: string, signal: AbortSignal) => {
          session.assertCurrent();
          const { loadCredentialDetail } = await import('../wallet/credential-detail');
          session.assertCurrent();
          const result = await loadCredentialDetail(config, session.token, reference, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    enrollment: (expectedUid: string) => {
      const session = captureSession(expectedUid);
      return {
        assertCurrent: session.assertCurrent,
        prepare: async (id: string, signal: AbortSignal) => {
          session.assertCurrent();
          const result = await prepareEnrollment(config, session.token, id, signal);
          session.assertCurrent(); return result;
        },
        complete: async (id: string, submission: EnrollmentSubmission, signal: AbortSignal) => {
          session.assertCurrent();
          const result = await completeEnrollment(config, session.token, id, submission, signal);
          session.assertCurrent(); return result;
        },
      };
    },
    wallets: async (expectedUid: string, signal: AbortSignal, after: string | null = null) => {
      const user = auth.currentUser;
      const assertIdentity = () => {
        if (!user || auth.currentUser !== user || user.uid !== expectedUid) throw new WalletCoreError('auth/session-changed');
      };
      assertIdentity();
      const result = await loadWalletPage(config, async () => {
        assertIdentity();
        const token = await user!.getIdToken();
        assertIdentity();
        return token;
      }, signal, after);
      assertIdentity();
      return result;
    },
    prepareLogin: (signal: AbortSignal) => exclusive(() => { assertSignedOut(); return access.prepareLogin(signal); }),
    prepareRegistration: (input: Parameters<typeof access.prepareRegistration>[0], signal: AbortSignal) =>
      exclusive(() => { assertSignedOut(); return access.prepareRegistration(input, signal); }),
    completeLogin: (...args: Parameters<typeof access.completeLogin>) => exclusive(async () => {
      assertSignedOut(); const token = await access.completeLogin(...args); await startSession(token, args[2]);
    }),
    completeRegistration: (...args: Parameters<typeof access.completeRegistration>) => exclusive(async () => {
      assertSignedOut(); const token = await access.completeRegistration(...args); await startSession(token, args[2]);
    }),
    logout: () => exclusive(() => signOut(auth)),
  };
}
