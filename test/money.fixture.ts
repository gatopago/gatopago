import { getAddress } from 'viem';
import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { hashSecurityPolicy, type SecurityPolicy } from '@gatopago/shared/v3/security-policy';
import { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';
import { loadAaveMarket } from '@gatopago/shared/v3/aave-market';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { maximumOperationGasCost } from '@gatopago/shared/v3/paymaster';
import { writeMoneyDraft } from '@gatopago/shared/v3/money-review-record';
import {
  prepareMoneyOperation,
  type MoneyOperationContext,
} from '@gatopago/shared/v3/money-operation';
import type { MoneyKind } from '@gatopago/shared/v3/money-wire';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import type { MoneySelection } from '../src/wallet/money-release';
import release from '../config/money-release.json';

export function moneyFixture(
  kind: MoneyKind = 'aave_supply',
  recipientAddress = `0x${'66'.repeat(20)}`,
) {
  const keys = initializationFixture(),
    initial = prepareInitialization(keys.input),
    now = Math.floor(Date.now() / 1000);
  const market = { ...release.market, digest: release.market.digest as `0x${string}` },
    admitted = loadAaveMarket(market);
  const document = JSON.stringify({
    ...keys.profile.deployment,
    network_id: 'eip155:421614',
    genesis_hash: admitted.genesis_hash,
  });
  const deployment = { document, digest: deploymentDocumentDigest(document) };
  const policy: SecurityPolicy = {
    mode: 'active',
    spendThreshold: 1,
    adminThreshold: 1,
    upgradeDelaySeconds: 259200,
    signers: [
      {
        kind: 1,
        roles: 3,
        key: keys.input.publicKey,
        verifier: keys.profile.webauthn_verifier.address,
        verifierCodeHash: keys.profile.webauthn_verifier.runtime_code_hash,
      },
    ],
  };
  const walletId = createResourceId('wallet'),
    accountId = createResourceId('walletAccount');
  const selection: MoneySelection = {
    wallet_id: walletId,
    wallet_account_id: accountId,
    account_id: initial.message.accountId,
    address: initial.account,
    network_id: 'eip155:421614',
    deployment,
    market,
    gas: { ...release.gas, deployment_sha256: deployment.digest },
  };
  const request = {
    schema_version: 1 as const,
    kind,
    wallet_id: walletId,
    wallet_account_id: accountId,
    network_id: 'eip155:421614' as const,
    market_id: admitted.market_id,
    asset_id: admitted.asset_id,
    amount_atomic: '20000000',
    client_release_id: CLIENT_RELEASE_ID,
    ...(kind === 'aave_withdraw_and_pay'
      ? { recipient_address: getAddress(recipientAddress) }
      : {}),
  };
  const limits = release.gas.limits[kind],
    gas = {
      verificationGasLimit: BigInt(limits.verificationGasLimit),
      callGasLimit: BigInt(limits.callGasLimit),
      preVerificationGas: BigInt(limits.preVerificationGas),
      maxFeePerGas: BigInt(limits.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(limits.maxPriorityFeePerGas),
    };
  const gasMaximum = maximumOperationGasCost(gas).toString();
  const context: MoneyOperationContext = {
    account: initial.account,
    wallet_account_id: accountId,
    account_id: initial.message.accountId,
    deployment_digest: deployment.digest,
    policy_hash: hashSecurityPolicy(policy),
    security_version: 1n,
    entry_point: keys.profile.deployment.entry_point,
    nonce: 0n,
    market,
    native_asset_id: 'eip155:421614/slip44:60',
    gas,
    budget: {
      usdc_available_atomic: '100000000',
      position_available_atomic: '100000000',
      native_available_atomic: gasMaximum,
      maximum_native_gas_atomic: gasMaximum,
      debt_base_atomic: '0',
      liquidity_atomic: '100000000',
      supply_capacity_atomic: null,
    },
    checkpoint: {
      block_number: admitted.admitted_block_number,
      block_hash: admitted.admitted_block_hash,
      observed_at: now,
      expires_at: now + 30,
    },
    valid_until: now + 30,
  };
  const review = { request, context, policy, scope: keys.input.scope, prepared_at: now },
    draft = writeMoneyDraft(review),
    candidate = prepareMoneyOperation(request, context, now);
  const wire = {
    money_schema_version: 1,
    preparation_id: createResourceId('operation'),
    wallet_id: walletId,
    wallet_account_id: accountId,
    state: 'prepared',
    consent_digest: candidate.digest,
    review_json: draft.json,
    review_sha256: draft.digest,
    expires_at: candidate.plan.validUntil,
    send_enabled: false,
    operation_id: null,
  };
  const environment = parseEnvironment({
    ...environments.production,
    status: 'provisioned',
    firebase_project_id: 'v3-runtime-test',
  });
  const config = buildAuthConfig(environment, {
    apiKey: `AIza${'a'.repeat(35)}`,
    appId: '1:123:web:abcdef',
    turnstileSiteKey: `0x${'a'.repeat(22)}`,
  }) as EnabledAuthConfig;
  const operationId = createResourceId('operation');
  const status = {
    money_schema_version: 1,
    operation_id: operationId,
    preparation_id: wire.preparation_id,
    wallet_id: walletId,
    wallet_account_id: accountId,
    network_id: request.network_id,
    state: 'authorized',
    consent_digest: candidate.digest,
    userop_hash: candidate.userOpHash,
    review_json: draft.json,
    review_sha256: draft.digest,
    expires_at: candidate.plan.validUntil,
    dispatched_at: null,
    job: null,
    funds_reserved: true,
    settlement: 'unconfirmed',
    receipt: null,
    receipt_sha256: null,
    evidence_conflict: false,
    send_enabled: false,
  };
  return {
    keys,
    now,
    market: admitted,
    selection,
    request,
    review,
    wire,
    candidate,
    operationId,
    status,
    environment,
    config,
  };
}
