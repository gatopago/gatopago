# GatoPago Web

Next.js app for the GatoPago landing page and the consumer wallet at `gatopago.com`. Networks are
testnets (Arbitrum Sepolia, Avalanche Fuji, Monad testnet): do not send real funds.

## How the wallet works

The account is a GatoPago smart account (ERC-4337) owned by the user's passkeys; see
[`protocol`](../protocol). The browser holds no secrets and depends on GatoPago only for
convenience:

- **Sign-up:** the device creates a passkey and the account address derives from it. The account
  signs a Sign-In with Ethereum message; with an invitation and Turnstile, Wallet Core admits it
  and returns a session token. The username and display name are then saved.
- **Sign-in:** one passkey prompt on a device that used the account before. Elsewhere, a first
  prompt identifies the passkey (its public key is recovered from the signature) and a second
  one signs in.
- **One balance:** one Multicall3 call per network reads USDC, the native token and USDC saved in
  Aave, from the network's RPC (`GATOPAGO_WALLET_RPC_URLS`, e.g. a domain-restricted Alchemy key,
  falling back to the public one). Screens share it; it is read again after the account's own
  operations, on payment notifications and when the app becomes visible, never on a timer. The
  home network (`GATOPAGO_HOME_NETWORK`, Arbitrum Sepolia today) is where it is meant to live.
- **Sending** builds a user operation that GatoPago's paymaster sponsors and its bundler relays
  (`api.gatopago.com/app/v1/{paymaster,bundler}/:network`). It starts on the destination network
  when that network holds enough; otherwise it crosses from another network with Circle's CCTP,
  whose Forwarding Service mints on the destination. "Between networks" moves the user's own
  USDC, by default to the home network.
- **Activity** comes from Wallet Core (`/app/v1/activity`), which keeps members' USDC movements
  as Alchemy webhooks deliver them; each opens its receipt.
- **Notifications** (optional, `GATOPAGO_FIREBASE_*`): the device registers with Firebase Cloud
  Messaging; `public/sw.js` shows each payment and tells open windows to refresh.
- **Grow and Swap** supply USDC to Aave V3 and swap it with the native token through Uniswap v3,
  on the home network, each in one sponsored operation.
- **Requests and Business:** a request is a GatoPago Flow payment intent paid at `/pay/:id`;
  `/business` is the merchant console (API keys, webhooks, payments and events).
- **Backup keys:** adding or removing a passkey is an approval signed once, stored by Wallet Core
  and applied on every network: where the account exists right away, elsewhere before its first
  operation. Removing a key applies everywhere at once.

## Development

Node 24 and pnpm 11. Copy `.env.example` to `.env.local` and point `GATOPAGO_API_ORIGIN` at a
running Wallet Core.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Checks, also run by CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
`@gatopago/shared` and `@gatopago/brand` come from `vendor/`.

Pages are served with a per-request CSP nonce that allows connections only to Wallet Core and Flow,
the networks' RPCs, Circle's Iris API and, when notifications are configured, Firebase. Installing the PWA is optional; its service worker caches only public assets.
