# GatoPago Web

One Next.js application for marketing, passkey access and the consumer account.
Wallet Core owns identity verification and wallet operations; Firebase holds
the browser session. Flow is the separate payment service.

Production hosting currently uses **Arbitrum Sepolia testnet**. Do not send
real funds or mainnet tokens.

## Account flow

1. Enter an invitation, display name and username.
2. Submit **Create account** to create and verify the same passkey through the
   device prompts, without preparation or verification buttons in the app.
   **Sign in** opens the device prompt from its first click.
3. Review and authorize the account configuration, then its onchain creation.
4. After creation evidence is recorded, verify and explicitly publish the
   receiving username. A single complete wallet/network page is preselected.
5. Open the account to load its observed balance, or review and sign a transfer.
   Submission is not settlement: the same operation is followed to its verified
   result, reconciliation and receipt.

One authorized credential is sufficient for the current consumer profile.
Backup credentials are optional. Losing every authorized credential means
permanent loss of access; support and email cannot recover the funds.

Creation and sending use separate, explicit authorizations. React effects
only read data: they never sign, confirm or deliver an operation. Uncertain
confirmation recovery stays explicit because it can replay the same command.
After delivery, visible-screen tracking reads only an identified operation;
it stops on reconciliation, expiry, review or a read error.

Receiving requires a fresh backend check. A predicted address or historical
creation receipt never enables deposits. Failed balance reads are not shown as
zero. A balance observation is not an available-to-spend authorization.

After an owned transfer reports reconciliation, the account requests one fresh
balance read. Repeated status reads do not repeat that refresh. Failed reads
clear the old observation rather than showing zero; they do not undo the
recorded receipt or release reservations in the browser. Receipts use the exact
reviewed amount for MAX, prioritize conflicting evidence, and offer Done only
after a terminal result has released its reservation.

Before confirmation, the browser retains a non-authorizing URL fragment with
the wallet/account, network, consent digest and expiry, not signatures or tokens.
Reloading that URL restores the same reservation through an authenticated GET,
even after its preparation is purged. A held, current-release transfer still
requires an explicit Send action and fresh server preflight; pending/uncertain
delivery never becomes another automatic send. Completion clears only the
locator, not operation records. This is same-tab/URL restoration, not complete
account history or cross-device discovery.

## Current limits

- Automatic creation pricing uses Wallet Core's matching release: it derives the
  maximum from reviewed gas limits, and Web shows it and the payer before the
  separate passkey authorization. An empty preparation request restores saved
  terms unchanged; it cannot authorize a charge. These are ceilings, not measured
  fees; exact signed-operation simulation remains required. Release the matching
  backend before this client; no sponsorship was activated.
- The deployed runtime uses a self relayer with **no configured paymaster**.
  The account needs test ETH for creation and transfers. A relayer advancing
  transaction gas does not mean the account's ERC-4337 fee is sponsored.
- Transfer lookup uses an operation reference; it is not a full account history.
- Transfer reload recovery uses an authenticated Wallet Core read endpoint,
  checked with synthetic services and real D1 tests. A failed balance read no
  longer hides the owned account or its saved
  receipt: display metadata comes from the reviewed server registry, not a
  current balance. A new transfer still requires a fresh balance and preflight.
  Verified account context, valid session evidence and the matching deployment
  pin remain required; access expiry is not bypassed. Physical-device and funded
  Arbitrum Sepolia acceptance remain outstanding.
- Registering another passkey does not activate it as an onchain signer.
  Backup delivery and an independent exit flow are not enabled in the consumer UI.
- Checkout links, swaps, cross-chain, contacts and a faucet are not
  connected consumer flows. Their empty pages were removed, not presented as
  working features. The scanner accepts addresses and `/@username` profiles,
  not checkout links. This does not remove the independent Flow backend.
- Marketing includes the account illustration, payment-link example,
  Grow/Aave, commercial API presentation and confirmation preview. Illustrations
  stay identified as examples; the card stays identified as a future concept.
  `/docs` documents current Flow routes; `/pay/demo-cafe-norte` is a sample receipt.
- Public receiving uses `/@username`. Legacy V2 aliases and payment formats
  are not supported.

## Local development

Use Node 24 and pnpm 11.23.0 from this repository root:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Set the public Web/API/Business origins, Firebase identifiers, Turnstile site
key and enabled networks in the environment file. The namespace is
`GATOPAGO_ENVIRONMENT=production`, including isolated local development.
HTTP is accepted only on loopback; WebAuthn uses the exact configured origin.

Run Wallet Core separately. Never put private keys, Firebase service accounts
or provider secrets in Web. Deployment platform variables are configured
separately from ignored local environment files.

The application uses the standard Next.js commands: `pnpm dev` runs `next dev`,
`pnpm build` runs `next build`, and `pnpm start` runs `next start`. ESLint uses
the official Next.js Core Web Vitals plugin alongside TypeScript and React Hooks.
The shared GatoPago
packages already ship compiled JavaScript and require no custom transpilation.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

CI runs these same commands. The packages in `vendor/` are pinned snapshots,
not imports from another checkout. Wallet authority is checked against the
admitted deployment configuration; a successful build is not financial readiness.

The `test/serve-*.mjs` harnesses run actual components against synthetic services;
start one with, for example, `node test/serve-enrollment.mjs`.
The enrollment harness uses browser WebAuthn and a cryptographic verifier, but
identity, persistence and chain confirmation are simulated. Screenshots and
virtual-authenticator results do not prove a physical-device or funded
end-to-end run.

## PWA and security

The Arbitrum money screens expose an Aave USDC position at `/grow` and an
Aave funding choice for payments. Deposit, withdrawal and withdrawal-and-pay
are selected from closed recipes and independently reviewed against
`config/money-release.json`, generated from the admitted server configuration.
All server feature flags remain disabled until public acceptance is complete.

Unresolved operations retain resource IDs in a URL fragment and bounded local
storage. Recovery reads the owned server reference; it does not replay signing
or sending. `node test/serve-money.mjs` uses synthetic services and ephemeral
P256 assertions. Its screenshots do not prove a public funded operation.

Implementation evidence: [Arbitrum status](../protocol/docs/arbitrum-delivery/STATUS.md).

Installation is optional and prompted only by a user gesture. Release builds
register the service worker, cache only public assets and a neutral offline
page, and never cache sessions, quotes, receipts or monetary operations.
Reloads respect active-operation guards. A pending worker update requires all
windows of that origin to close.

Pages use CSP nonces, no-store and frame protection. Unsupported protocol
revisions block new operations rather than silently falling back to V2.

See [the current cleanup evidence](docs/operations/CLEANUP-2026-10-02.md) for
what was changed, tested, deployed and what still needs acceptance.
