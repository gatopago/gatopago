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
- **Balances** are read from each network's public RPC.
- **Sending** builds a user operation that GatoPago's paymaster sponsors and its bundler relays
  (`api.gatopago.com/app/v1/{paymaster,bundler}/:network`).
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

Pages are served with a per-request CSP nonce that allows connections only to Wallet Core and the
networks' RPCs. Installing the PWA is optional; its service worker caches only public assets.
