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
- **Requests and Business:** a request is a GatoPago Flow payment intent paid at `/pay/:id`. The
  merchant console is its own site, GatoPago Business ([`gatopago-dashboard`](../gatopago-dashboard)):
  it signs in with a QR that the app approves at `/approve` with the passkey (Scan reads it too),
  or with the same passkey.
- **Coins, not networks:** by default people see their coins (USDC as one balance across
  networks, and each network's coin: ETH, AVAX, MON) and never choose a network, except the
  warning of which network to use when receiving from an exchange. Settings → View → Advanced
  shows networks, the balance on each, moving between networks and technical details
  (`@gatopago/shared/assets`, kept on the device).
- **Pay my team** (`/team`): several people paid in one operation and one signature, with fixed
  amounts (from the available balance or straight from Aave savings) or shares of an amount that
  arrived, with a part saved; all payments go through or none do (`@gatopago/shared/rules`).
- **Every account is Mera's:** [Mera](https://github.com/category-labs/mera) derives an Ethereum
  key from each passkey's PRF output; that key owns the GatoPago account (ERC-7913) and signs during
  a session that ends after 15 minutes idle or when the app closes. A passkey without PRF cannot
  create an account. A backup key is another passkey: its Mera key is added as an owner and its
  user handle names the account, so any device finds it. An account from before (owned by its
  passkey's P-256 key) is found by that key and approves its Mera key once on its next sign-in. The key exists only in memory while the session lasts, and it fully controls the
  account: a copy taken from memory works until the account removes it, unlike the passkey.
- **One way in:** "Create account" and "Sign in" are the only buttons, whatever key owns the
  account; the word Mera never shows. With Mera on, creating an account uses Mera's key when the
  device returns PRF, and otherwise the same passkey owns the account (no second passkey is left
  behind; a cancelled prompt creates nothing). Signing in on a new device is one prompt: the same
  assertion derives Mera's key and carries the signature the passkey's key is recovered from, so
  either kind of account is found, and one is never mistaken for the other. Passkeys belong to
  `GATOPAGO_PASSKEY_RP_ID`.
- **Backup keys:** adding or removing a passkey is an approval signed once, stored by Wallet Core
  and applied on every network: on the home network right away (so a new key can sign in from day
  one), where the account exists right away, elsewhere before its first operation. Removing a key
  is applied on every network one by one; the security screen shows where it is still pending, and
  a pending network applies it before its next operation.
- **Stellar** (optional, `GATOPAGO_STELLAR_NETWORK`, with Wallet Core's Stellar on): the account's
  Stellar address (a smart account signed by the same passkeys, `@gatopago/shared/stellar`) adds
  its USDC to the balance. In the advanced view it receives at that address and moves USDC with
  the EVM networks through CCTP; anyone can send to a Stellar address (`G…` with a USDC trustline,
  or `C…`), from the Stellar balance or through CCTP from an EVM network. Wallet Core creates the
  account, pays its fees and mints what arrives through CCTP. Each Stellar call is one passkey
  prompt, or none in a Mera session: Mera also derives the account's Stellar key (SEP-5), which the
  session's Ethereum key approves once (`POST /app/v1/stellar/keys`). A call whose answer is lost
  is found out before another one, as on EVM. Security lists Stellar's signers with the other networks: removing a key removes
  it there too, and added keys are synced from that list.

## Development

Node 24 and pnpm 11. Copy `.env.example` to `.env.local` and point `GATOPAGO_API_ORIGIN` at a
running Wallet Core. `ox` stays at the version viem pins: a newer one would ship twice in the bundle.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Checks, also run by CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Configuration

Every variable is public: it reaches the browser or the page's security policy. Set them in Vercel
(_Settings → Environment Variables_) and redeploy; a missing required one fails the build.

| Name                            | Required | What it is                                                                               | How to get it                                                                                                                    |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GATOPAGO_WEB_ORIGIN`           | yes      | This site's origin; payment and profile links use it                                     | `https://gatopago.com`                                                                                                           |
| `GATOPAGO_API_ORIGIN`           | yes      | Wallet Core and Flow, the only API the pages may call                                    | `https://api.gatopago.com`                                                                                                       |
| `GATOPAGO_WALLET_NETWORKS`      | yes      | CAIP-2 ids of the networks the wallet shows                                              | The same as Wallet Core's `WALLET_NETWORKS`                                                                                      |
| `GATOPAGO_HOME_NETWORK`         | yes      | Where balances live, Grow and Swap run, and charges settle                               | One of the networks; Flow's `HOME_NETWORK`                                                                                       |
| `GATOPAGO_TURNSTILE_SITE_KEY`   | yes      | Sign-up challenge widget                                                                 | Cloudflare → Turnstile → the widget's site key (Wallet Core holds its secret)                                                    |
| `GATOPAGO_BUSINESS_ORIGIN`      | no       | GatoPago Business, the merchant console: the menu, the landing and the docs link to it   | `https://business.gatopago.com`; by default, this site's domain under `business.`                                                |
| `GATOPAGO_PASSKEY_RP_ID`        | no       | The domain passkeys belong to; Mera's keys derive from them, so it must never change     | Empty uses this site's domain (`gatopago.com`); the merchant console must use the same one                                       |
| `GATOPAGO_MERA_SESSION_MINUTES` | no       | Minutes a Mera signing session lasts without use before the passkey is needed again      | `15` by default; shorter is safer, longer asks less                                                                              |
| `GATOPAGO_STELLAR_NETWORK`      | no       | Shows Stellar beside the EVM networks; empty hides it                                    | `stellar:testnet`, the same as Wallet Core's `STELLAR_NETWORK`, once Wallet Core has `STELLAR_SECRET_KEY`                        |
| `GATOPAGO_STELLAR_RPC_URL`      | no       | Stellar RPC for the browser's reads, instead of the network's public one                 | Empty uses `soroban-testnet.stellar.org`                                                                                         |
| `GATOPAGO_WALLET_RPC_URLS`      | no       | `{"<network>": "<url>"}`: RPC for the browser's reads; each falls back to the public one | Alchemy app _GatoPago-web_, with every network enabled and its allowlist limited to `gatopago.com` (the browser exposes the key) |
| `GATOPAGO_FIREBASE_CONFIG`      | no       | `{"apiKey","projectId","messagingSenderId","appId"}` of the Firebase web app             | Firebase → Project settings → General → Your apps → the web app's `firebaseConfig`                                               |
| `GATOPAGO_FIREBASE_VAPID_KEY`   | no       | Public key for Web Push                                                                  | Firebase → Project settings → Cloud Messaging → Web push certificates                                                            |

Notifications appear in Settings only with both Firebase variables, and work only with Wallet
Core's `FIREBASE_SERVICE_ACCOUNT` from the same project.
`@gatopago/shared` and `@gatopago/brand` come from `vendor/`.

Pages are served with a per-request CSP nonce that allows connections only to Wallet Core and Flow,
the networks' RPCs (Stellar's when it is on), Circle's Iris API and, when notifications are configured, Firebase. Installing the PWA is optional; its service worker caches only public assets.

The public pages (landing, `/docs`, legal and the payment example, in `app/(static)` and
`app/(en)`) are prerendered and cached by the CDN. They carry no session and nothing a visitor
writes, so they get a static CSP without a nonce: inline scripts from this site only, no other
origin and no eval (`src/security/static-pages.ts`; a test keeps its list equal to those pages).
Each language has its own path there (`/docs`, `/en/docs`); `?lang=en` redirects to it.
