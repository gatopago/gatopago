import { getAddress, isAddressEqual } from 'viem';
import type { Environment } from '@gatopago/environment';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import {
  deploymentDocumentDigest,
  loadPinnedDeploymentManifest,
  requireHash,
} from '@gatopago/shared/v3/deployment';
import { loadAaveMarket } from '@gatopago/shared/v3/aave-market';
import { readMoneyDraft, type MoneyProof } from '@gatopago/shared/v3/money-review-record';
import {
  parseMoneyRequest,
  type MoneyOperationRequest as MoneyRequest,
} from '@gatopago/shared/v3/money-wire';
import { parseAtomicAmount, parseResourceId } from '@gatopago/shared/v3/primitives';
import { assertFinalityAssessment } from '@gatopago/shared/v3/finality';
import { verifyTransferQuorum } from '@gatopago/shared/v3/transfer-authorization';
import { serializeTransferConfirmation } from '@gatopago/shared/v3/transfer-wire';
import type { EnabledAuthConfig } from '../auth/config';
import { assertMoneyGas, type MoneySelection } from './money-release';
import { exact, record, walletTransport, WalletCoreError } from './http';

const fail = () => new WalletCoreError('wallet/unavailable');
const states = [
  'authorized',
  'dispatch_pending',
  'submitted',
  'confirming',
  'reconciled',
  'reverted_confirmed',
  'expired_unsubmitted',
  'review_required',
] as const;
export type MoneyState = (typeof states)[number];
function selected(input: MoneySelection) {
  const value = structuredClone(input);
  requireHash(value.deployment.digest);
  requireHash(value.account_id);
  parseResourceId('wallet', value.wallet_id);
  parseResourceId('walletAccount', value.wallet_account_id);
  const manifest = loadPinnedDeploymentManifest(value.deployment.document, value.deployment.digest),
    market = loadAaveMarket(value.market);
  if (
    manifest.lifecycle_status !== 'deployed' ||
    manifest.network_id !== value.network_id ||
    manifest.generation !== 3 ||
    market.network_id !== value.network_id ||
    market.genesis_hash !== manifest.genesis_hash ||
    value.gas.deployment_sha256 !== value.deployment.digest ||
    value.gas.market_sha256 !== value.market.digest
  )
    throw fail();
  return { ...value, address: getAddress(value.address), manifest, admittedMarket: market };
}
function parseOwnedMoneyDraft(
  json: unknown,
  digest: unknown,
  selection: MoneySelection,
  environment: Environment,
  now = Math.floor(Date.now() / 1000),
) {
  const expected = selected(selection),
    restored = readMoneyDraft(json, digest),
    { candidate: c, review } = restored;
  if (
    !Number.isSafeInteger(now) ||
    now < review.prepared_at ||
    c.request.wallet_id !== expected.wallet_id ||
    c.request.wallet_account_id !== expected.wallet_account_id ||
    c.request.network_id !== expected.network_id ||
    c.account !== expected.address ||
    c.plan.accountId !== expected.account_id ||
    c.deployment_digest !== expected.deployment.digest ||
    !isAddressEqual(c.plan.entryPoint, expected.manifest.entry_point) ||
    review.context.market.document !== expected.market.document ||
    review.context.market.digest !== expected.market.digest ||
    review.scope.rpId !== environment.webauthn_rp_id ||
    review.scope.origin !== environment.web_origin
  )
    throw fail();
  return restored;
}
export function parseMoneyPreparation(
  input: unknown,
  selection: MoneySelection,
  requestInput: MoneyRequest,
  environment: Environment,
  now = Math.floor(Date.now() / 1000),
  expectedId?: string,
) {
  const request = parseMoneyRequest(requestInput);
  const restored = parseMoneyPreparationHistory(input, selection, environment, expectedId, now);
  if (restored.state !== 'prepared' || request.client_release_id !== CLIENT_RELEASE_ID)
    throw fail();
  const c = restored.candidate;
  if (now >= c.plan.validUntil || JSON.stringify(request) !== JSON.stringify(c.request))
    throw fail();
  assertMoneyGas(selection, request.kind, restored.review.context.gas, now);
  return restored;
}

export function parseMoneyPreparationHistory(
  input: unknown,
  selection: MoneySelection,
  environment: Environment,
  expectedId?: string,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !record(input) ||
    !exact(input, [
      'money_schema_version',
      'preparation_id',
      'wallet_id',
      'wallet_account_id',
      'state',
      'consent_digest',
      'review_json',
      'review_sha256',
      'expires_at',
      'send_enabled',
      'operation_id',
    ]) ||
    input.money_schema_version !== 1 ||
    input.wallet_id !== selection.wallet_id ||
    input.wallet_account_id !== selection.wallet_account_id ||
    input.send_enabled !== false ||
    !['prepared', 'expired_unsigned'].includes(String(input.state)) ||
    (expectedId !== undefined && input.preparation_id !== expectedId)
  )
    throw fail();
  const restored = parseOwnedMoneyDraft(
    input.review_json,
    input.review_sha256,
    selection,
    environment,
    now,
  );
  const c = restored.candidate;
  if (input.expires_at !== c.plan.validUntil || input.consent_digest !== c.digest) throw fail();
  return Object.freeze({
    ...restored,
    wire: structuredClone(input),
    preparation_id: parseResourceId('operation', input.preparation_id),
    state: input.state as 'prepared' | 'expired_unsigned',
    expires_at: c.plan.validUntil,
    operation_id:
      input.operation_id === null ? null : parseResourceId('operation', input.operation_id),
    send_enabled: false as const,
  });
}
export type MoneyPreparation = ReturnType<typeof parseMoneyPreparation>;
export function parseMoneyConfirmation(input: unknown, preparation: MoneyPreparation) {
  if (
    !record(input) ||
    !exact(input, [
      'id',
      'preparation_id',
      'consent_digest',
      'state',
      'expires_at',
      'send_enabled',
    ]) ||
    input.preparation_id !== preparation.preparation_id ||
    input.consent_digest !== preparation.candidate.digest ||
    input.expires_at !== preparation.expires_at ||
    input.send_enabled !== false ||
    !states.includes(input.state as MoneyState)
  )
    throw fail();
  return Object.freeze({
    id: parseResourceId('operation', input.id),
    state: input.state as MoneyState,
    preparation_id: preparation.preparation_id,
    consent_digest: preparation.candidate.digest,
    expires_at: preparation.expires_at,
    send_enabled: false as const,
  });
}
export function parseMoneyStatus(
  input: unknown,
  selection: MoneySelection,
  environment: Environment,
  operationId: string,
) {
  if (
    !record(input) ||
    !exact(input, [
      'money_schema_version',
      'operation_id',
      'preparation_id',
      'wallet_id',
      'wallet_account_id',
      'network_id',
      'state',
      'consent_digest',
      'userop_hash',
      'review_json',
      'review_sha256',
      'expires_at',
      'dispatched_at',
      'job',
      'funds_reserved',
      'settlement',
      'receipt',
      'receipt_sha256',
      'evidence_conflict',
      'send_enabled',
    ]) ||
    input.money_schema_version !== 1 ||
    input.operation_id !== parseResourceId('operation', operationId) ||
    input.wallet_id !== selection.wallet_id ||
    input.wallet_account_id !== selection.wallet_account_id ||
    input.network_id !== selection.network_id ||
    input.send_enabled !== false ||
    typeof input.evidence_conflict !== 'boolean' ||
    !states.includes(input.state as MoneyState)
  )
    throw fail();
  const restored = parseOwnedMoneyDraft(
      input.review_json,
      input.review_sha256,
      selection,
      environment,
    ),
    c = restored.candidate;
  const state = input.state as MoneyState,
    settled = ['reconciled', 'reverted_confirmed'].includes(state),
    terminal = settled || state === 'expired_unsubmitted';
  if (
    input.consent_digest !== c.digest ||
    input.userop_hash !== c.userOpHash ||
    input.expires_at !== c.plan.validUntil ||
    input.funds_reserved !== !terminal ||
    input.settlement !== (settled ? state : 'unconfirmed') ||
    (input.dispatched_at !== null &&
      (typeof input.dispatched_at !== 'number' ||
        !Number.isSafeInteger(input.dispatched_at) ||
        input.dispatched_at < restored.review.prepared_at ||
        input.dispatched_at >= c.plan.validUntil)) ||
    ['authorized', 'expired_unsubmitted'].includes(state) !== (input.dispatched_at === null)
  )
    throw fail();
  let receipt: ReturnType<typeof parseMoneyReceipt> | null = null;
  if (input.receipt !== null)
    receipt = parseMoneyReceipt(input.receipt, input.receipt_sha256, c, selection);
  else if (input.receipt_sha256 !== null || settled) throw fail();
  if (
    settled &&
    (input.evidence_conflict ||
      (state === 'reconciled'
        ? receipt?.outcome !== 'execution_succeeded'
        : !['execution_reverted', 'outer_transaction_reverted'].includes(receipt?.outcome ?? '')))
  )
    throw fail();
  if (
    input.job !== null &&
    (!record(input.job) ||
      !exact(input.job, ['state', 'reason', 'failures']) ||
      !['ready', 'queued', 'running', 'reconciled', 'review'].includes(String(input.job.state)) ||
      !(
        input.job.reason === null ||
        ['processing_error', 'observation_timeout', 'conflicting_evidence'].includes(
          String(input.job.reason),
        )
      ) ||
      typeof input.job.failures !== 'number' ||
      !Number.isSafeInteger(input.job.failures) ||
      input.job.failures < 0 ||
      input.job.failures > 8)
  )
    throw fail();
  return Object.freeze({
    ...restored,
    operation_id: parseResourceId('operation', operationId),
    preparation_id: parseResourceId('operation', input.preparation_id),
    state,
    funds_reserved: !terminal,
    evidence_conflict: input.evidence_conflict,
    receipt,
    settlement: settled ? state : 'unconfirmed',
    dispatched_at: input.dispatched_at,
    send_enabled: false as const,
  });
}
function parseMoneyReceipt(
  input: unknown,
  digest: unknown,
  c: ReturnType<typeof readMoneyDraft>['candidate'],
  selection: MoneySelection,
) {
  const outer = record(input) && input.outcome === 'outer_transaction_reverted';
  if (
    !record(input) ||
    !exact(input, [
      'schema_version',
      'money_schema_version',
      'network_id',
      'market_id',
      'market_sha256',
      'deployment_sha256',
      'userop_hash',
      'consent_digest',
      'transaction_hash',
      'block_hash',
      'block_number',
      'transaction_index',
      'kind',
      'amount_atomic',
      'recipient_address',
      'outcome',
      'actual_gas_cost',
      'actual_gas_used',
      'log_indexes',
      'finality',
      'settlement',
      'block_timestamp',
      ...(outer ? ['outer_transaction', 'nonexecution'] : []),
    ]) ||
    input.schema_version !== 1 ||
    input.money_schema_version !== 1 ||
    deploymentDocumentDigest(JSON.stringify(input)) !== digest ||
    input.network_id !== c.request.network_id ||
    input.market_id !== c.request.market_id ||
    input.market_sha256 !== selection.market.digest ||
    input.deployment_sha256 !== c.deployment_digest ||
    input.consent_digest !== c.digest ||
    input.userop_hash !== c.userOpHash ||
    input.kind !== c.request.kind ||
    input.amount_atomic !== c.request.amount_atomic ||
    input.recipient_address !== (c.request.recipient_address ?? null) ||
    !['execution_succeeded', 'execution_reverted', 'outer_transaction_reverted'].includes(
      String(input.outcome),
    ) ||
    input.finality !== 'not_assessed' ||
    input.settlement !== 'not_assessed'
  )
    throw fail();
  requireHash(input.transaction_hash);
  requireHash(input.block_hash);
  for (const key of [
    'block_number',
    'block_timestamp',
    'transaction_index',
    'actual_gas_cost',
    'actual_gas_used',
  ])
    parseAtomicAmount(input[key]);
  const logs = input.log_indexes;
  if (
    !record(logs) ||
    !exact(logs, ['operation', 'calls', 'pool', 'transfers', 'approvals']) ||
    !Array.isArray(logs.transfers) ||
    logs.transfers.length > 2 ||
    !Array.isArray(logs.approvals) ||
    logs.approvals.length > 3
  )
    throw fail();
  if (!outer) parseAtomicAmount(logs.operation);
  if (logs.calls !== null) parseAtomicAmount(logs.calls);
  if (logs.pool !== null) parseAtomicAmount(logs.pool);
  for (const index of [...logs.transfers, ...logs.approvals]) parseAtomicAmount(index);
  let operatorGas: string | null = null;
  if (outer) {
    const tx = input.outer_transaction,
      proof = input.nonexecution;
    if (
      input.actual_gas_cost !== '0' ||
      input.actual_gas_used !== '0' ||
      logs.operation !== null ||
      logs.calls !== null ||
      logs.pool !== null ||
      logs.transfers.length ||
      logs.approvals.length ||
      !record(tx) ||
      !exact(tx, [
        'operator',
        'nonce',
        'gas_used',
        'effective_gas_price_atomic',
        'gas_used_for_l1',
        'gas_cost_atomic',
      ]) ||
      typeof tx.operator !== 'string' ||
      /^0x0{40}$/i.test(getAddress(tx.operator)) ||
      !record(proof) ||
      !exact(proof, ['nonce', 'valid_until', 'checkpoint']) ||
      proof.nonce !== c.plan.nonce.toString() ||
      proof.valid_until !== c.plan.validUntil ||
      !record(proof.checkpoint) ||
      !exact(proof.checkpoint, ['block_number', 'block_hash', 'block_timestamp'])
    )
      throw fail();
    const checkpoint = proof.checkpoint,
      gas = BigInt(parseAtomicAmount(tx.gas_used)),
      price = BigInt(parseAtomicAmount(tx.effective_gas_price_atomic));
    requireHash(checkpoint.block_hash);
    parseAtomicAmount(tx.nonce);
    const time = BigInt(parseAtomicAmount(checkpoint.block_timestamp)),
      height = BigInt(parseAtomicAmount(checkpoint.block_number));
    if (
      time <= BigInt(c.plan.validUntil) ||
      time > BigInt(Math.floor(Date.now() / 1000)) ||
      height < BigInt(String(input.block_number)) ||
      (height === BigInt(String(input.block_number)) &&
        checkpoint.block_hash !== input.block_hash) ||
      gas === 0n ||
      price === 0n ||
      BigInt(parseAtomicAmount(tx.gas_used_for_l1)) > gas ||
      BigInt(parseAtomicAmount(tx.gas_cost_atomic)) !== gas * price
    )
      throw fail();
    operatorGas = String(tx.gas_cost_atomic);
  }
  return Object.freeze({
    transaction_hash: input.transaction_hash,
    block_hash: input.block_hash,
    block_number: String(input.block_number),
    actual_gas_cost: String(input.actual_gas_cost),
    actual_gas_used: String(input.actual_gas_used),
    operator_gas_cost: operatorGas,
    outcome: input.outcome as
      'execution_succeeded' | 'execution_reverted' | 'outer_transaction_reverted',
  });
}

export function moneyClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  const path = (s: MoneySelection) =>
    `/wallets/${parseResourceId('wallet', s.wallet_id)}/accounts/${parseResourceId('walletAccount', s.wallet_account_id)}`;
  const account = (s: MoneySelection) => ({
    generation: '3',
    contract_manifest_version: selected(s).manifest.manifest_id,
  });
  async function request(
    s: MoneySelection,
    suffix: string,
    signal: AbortSignal,
    method: 'GET' | 'POST' = 'GET',
    payload: object = {},
    key?: string,
  ) {
    selected(s);
    signal.throwIfAborted();
    const result = await walletTransport(config, token, signal, 'money').request(
      `${path(s)}/${suffix}`,
      method,
      payload,
      account(s),
      key,
    );
    if (![200, 202].includes(result.status)) throw fail();
    return result.value;
  }
  return {
    async prepare(s: MoneySelection, input: MoneyRequest, key: string, signal: AbortSignal) {
      const expected = structuredClone(s),
        intent = parseMoneyRequest(input);
      if (
        intent.wallet_id !== expected.wallet_id ||
        intent.wallet_account_id !== expected.wallet_account_id ||
        intent.network_id !== expected.network_id ||
        intent.client_release_id !== CLIENT_RELEASE_ID ||
        intent.market_id !== loadAaveMarket(expected.market).market_id
      )
        throw fail();
      return parseMoneyPreparation(
        await request(expected, 'money-preparations', signal, 'POST', intent, key),
        expected,
        intent,
        config.deployment,
      );
    },
    async preparation(s: MoneySelection, input: MoneyRequest, id: string, signal: AbortSignal) {
      const expected = structuredClone(s),
        intent = parseMoneyRequest(input),
        resource = parseResourceId('operation', id);
      return parseMoneyPreparation(
        await request(expected, `money-preparations/${resource}`, signal),
        expected,
        intent,
        config.deployment,
        undefined,
        resource,
      );
    },
    async restorePreparation(s: MoneySelection, id: string, signal: AbortSignal) {
      const expected = structuredClone(s),
        resource = parseResourceId('operation', id);
      return parseMoneyPreparationHistory(
        await request(expected, `money-preparations/${resource}`, signal),
        expected,
        config.deployment,
        resource,
      );
    },
    async confirm(
      s: MoneySelection,
      prepared: MoneyPreparation,
      proofsInput: readonly MoneyProof[],
      key: string,
      signal: AbortSignal,
    ) {
      const expected = structuredClone(s),
        preparation = parseMoneyPreparation(
          prepared.wire,
          expected,
          prepared.candidate.request,
          config.deployment,
        );
      const proofs = structuredClone(proofsInput);
      await verifyTransferQuorum(
        preparation.candidate.digest,
        preparation.review.policy,
        preparation.review.scope,
        proofs,
      );
      signal.throwIfAborted();
      const getToken = async () => {
        const value = await token();
        parseMoneyPreparation(
          preparation.wire,
          expected,
          preparation.candidate.request,
          config.deployment,
        );
        return value;
      };
      const serialized = serializeTransferConfirmation(preparation.candidate.digest, proofs);
      const payload = {
        money_schema_version: 1,
        consent_digest: serialized.consent_digest,
        proofs: serialized.proofs,
      };
      const result = await walletTransport(config, getToken, signal, 'money').request(
        `${path(expected)}/money-preparations/${preparation.preparation_id}/confirm`,
        'POST',
        payload,
        account(expected),
        key,
      );
      if (result.status !== 200) throw fail();
      return parseMoneyConfirmation(result.value, preparation);
    },
    async deliver(
      s: MoneySelection,
      prepared: MoneyPreparation,
      operationId: string,
      signal: AbortSignal,
    ) {
      const expected = structuredClone(s),
        preparation = parseMoneyPreparation(
          prepared.wire,
          expected,
          prepared.candidate.request,
          config.deployment,
        ),
        id = parseResourceId('operation', operationId);
      const getToken = async () => {
        const value = await token();
        parseMoneyPreparation(
          preparation.wire,
          expected,
          preparation.candidate.request,
          config.deployment,
        );
        return value;
      };
      const result = await walletTransport(config, getToken, signal, 'money').request(
        `${path(expected)}/money-operations/${id}/deliver`,
        'POST',
        { money_schema_version: 1, consent_digest: preparation.candidate.digest },
        account(expected),
      );
      const value = result.value;
      if (
        result.status !== 202 ||
        !record(value) ||
        !exact(value, [
          'money_schema_version',
          'operation_id',
          'userop_hash',
          'state',
          'delivery',
          'settlement',
        ]) ||
        value.money_schema_version !== 1 ||
        value.operation_id !== id ||
        value.userop_hash !== preparation.candidate.userOpHash ||
        !states.includes(value.state as MoneyState) ||
        !['accepted', 'uncertain', 'existing'].includes(String(value.delivery)) ||
        value.settlement !== 'unconfirmed'
      )
        throw fail();
      return Object.freeze({
        operation_id: id,
        delivery: value.delivery as 'accepted' | 'uncertain' | 'existing',
        state: value.state as MoneyState,
      });
    },
    async status(s: MoneySelection, operationId: string, signal: AbortSignal) {
      const expected = structuredClone(s),
        id = parseResourceId('operation', operationId);
      return parseMoneyStatus(
        await request(expected, `money-operations/${id}`, signal),
        expected,
        config.deployment,
        id,
      );
    },
    async capabilities(s: MoneySelection, signal: AbortSignal) {
      const expected = selected(s),
        value = await request(expected, 'money-capabilities', signal),
        now = Math.floor(Date.now() / 1000);
      if (
        !record(value) ||
        !exact(value, [
          'schema_version',
          'money_schema_version',
          'wallet_id',
          'wallet_account_id',
          'network_id',
          'market',
          'features',
          'observed_at',
          'expires_at',
          'spend_readiness',
        ]) ||
        value.schema_version !== 1 ||
        value.money_schema_version !== 1 ||
        value.wallet_id !== expected.wallet_id ||
        value.wallet_account_id !== expected.wallet_account_id ||
        value.network_id !== expected.network_id ||
        value.spend_readiness !== 'not_assessed' ||
        !record(value.market) ||
        !exact(value.market, ['document', 'digest']) ||
        value.market.document !== expected.market.document ||
        value.market.digest !== expected.market.digest ||
        !record(value.features) ||
        !exact(value.features, ['aave_supply', 'aave_withdraw', 'aave_withdraw_and_pay']) ||
        Object.values(value.features).some((flag) => typeof flag !== 'boolean') ||
        typeof value.observed_at !== 'number' ||
        typeof value.expires_at !== 'number' ||
        !Number.isSafeInteger(value.observed_at) ||
        !Number.isSafeInteger(value.expires_at) ||
        value.observed_at > now ||
        now >= value.expires_at ||
        value.expires_at > Math.min(value.observed_at + 30, expected.admittedMarket.valid_until)
      )
        throw fail();
      return Object.freeze({
        features: {
          aave_supply: value.features.aave_supply as boolean,
          aave_withdraw: value.features.aave_withdraw as boolean,
          aave_withdraw_and_pay: value.features.aave_withdraw_and_pay as boolean,
        },
        expires_at: value.expires_at,
      });
    },
    async position(s: MoneySelection, signal: AbortSignal) {
      const expected = selected(s),
        value = await request(expected, 'aave-position', signal),
        now = Math.floor(Date.now() / 1000);
      if (
        !record(value) ||
        !exact(value, [
          'usdc_balance_atomic',
          'native_balance_atomic',
          'position_balance_atomic',
          'scaled_position_atomic',
          'liquidity_index_ray',
          'debt_base_atomic',
          'liquidity_atomic',
          'supply_capacity_atomic',
          'allowance_atomic',
          'active',
          'frozen',
          'paused',
          'network_id',
          'market_id',
          'market_digest',
          'asset_id',
          'a_token',
          'account',
          'checkpoint',
          'observed_at',
          'expires_at',
          'finality',
          'spend_readiness',
          'wallet_id',
          'wallet_account_id',
          'finality_evidence',
          'available_balance',
        ]) ||
        value.wallet_id !== expected.wallet_id ||
        value.wallet_account_id !== expected.wallet_account_id ||
        value.network_id !== expected.network_id ||
        value.market_digest !== expected.market.digest ||
        value.market_id !== expected.admittedMarket.market_id ||
        value.asset_id !== expected.admittedMarket.asset_id ||
        value.a_token !== expected.admittedMarket.a_token ||
        value.account !== expected.address ||
        value.finality !== 'finalized' ||
        value.spend_readiness !== 'not_assessed' ||
        value.available_balance !== 'not_assessed' ||
        !record(value.checkpoint) ||
        !exact(value.checkpoint, ['block_number', 'block_hash', 'block_timestamp']) ||
        typeof value.observed_at !== 'number' ||
        typeof value.expires_at !== 'number' ||
        !Number.isSafeInteger(value.observed_at) ||
        !Number.isSafeInteger(value.expires_at) ||
        value.observed_at > now ||
        now >= value.expires_at ||
        value.expires_at >
          Math.min(
            value.observed_at + expected.admittedMarket.max_observation_age_seconds,
            expected.admittedMarket.valid_until,
          ) ||
        [value.active, value.frozen, value.paused].some((flag) => typeof flag !== 'boolean')
      )
        throw fail();
      requireHash(value.checkpoint.block_hash);
      assertFinalityAssessment(value.finality_evidence, {
        block_hash: value.checkpoint.block_hash,
        block_number: parseAtomicAmount(value.checkpoint.block_number),
        block_timestamp: parseAtomicAmount(value.checkpoint.block_timestamp),
        network_id: expected.admittedMarket.network_id,
        genesis_hash: expected.admittedMarket.genesis_hash,
      });
      if (
        value.finality_evidence.status !== 'finalized' ||
        value.finality_evidence.assessed_at > now ||
        value.finality_evidence.mechanism !== 'arbitrum_l1_data_finalized' ||
        now >= value.finality_evidence.expires_at ||
        value.expires_at > value.finality_evidence.expires_at
      )
        throw fail();
      for (const key of [
        'usdc_balance_atomic',
        'native_balance_atomic',
        'position_balance_atomic',
        'scaled_position_atomic',
        'liquidity_index_ray',
        'debt_base_atomic',
        'liquidity_atomic',
        'allowance_atomic',
      ])
        parseAtomicAmount(value[key]);
      if (value.supply_capacity_atomic !== null) parseAtomicAmount(value.supply_capacity_atomic);
      return Object.freeze({
        usdc_balance_atomic: String(value.usdc_balance_atomic),
        position_balance_atomic: String(value.position_balance_atomic),
        debt_base_atomic: String(value.debt_base_atomic),
        expires_at: value.expires_at,
        active: value.active as boolean,
        paused: value.paused as boolean,
        frozen: value.frozen as boolean,
        block_number: String(value.checkpoint.block_number),
        block_hash: value.checkpoint.block_hash,
      });
    },
  };
}
