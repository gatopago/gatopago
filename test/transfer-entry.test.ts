import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { transferFixture } from '@gatopago/test-fixtures/v3-transfer';
import type { BrowserAuth } from '../src/auth/browser';
import type { BalanceView } from '../src/wallet/balances';
import { TransferEntryStore } from '../src/wallet/transfer-entry-store';
import { TransferEntry } from '../src/wallet/TransferEntry';
import { accountPinsForRelease } from '../src/wallet/account-release';
import { creationProfileForRelease } from '../src/wallet/creation-release';
import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
 const f = transferFixture(true), account = { id:createResourceId('walletAccount'),wallet_id:f.request.wallet_id,network_id:f.request.network_id };
 const selected = { wallet_id:account.wallet_id,wallet_account_id:account.id,network_id:account.network_id,account_id:f.context.account_id,address:f.context.account,
  deployment:{ document:f.approval.security_evidence.document,digest:f.context.deployment_digest } };
 const balance:BalanceView = { account:{ ...account },address:selected.address,observed_at:f.now,expires_at:f.now+30,block_number:'10',block_hash:`0x${'ab'.repeat(32)}`,
  assets:[{ asset_id:`${account.network_id}/slip44:60`,symbol:'ETH',decimals:18,amount_atomic:'1' }] };
 vi.spyOn(Date,'now').mockReturnValue(f.now*1000);
 const session = { assertCurrent:vi.fn(),environment:parseEnvironment(environments.staging),read:vi.fn(async () => structuredClone(selected)) };
 const capture = vi.fn(() => session), store = new TransferEntryStore(capture,account);
 return { f,account,selected,balance,session,capture,store };
}
describe('Consumer send entry lifecycle', () => {
 it('is inert until explicit open and snapshots metadata instead of a budget', async () => {
  const x = fixture(); expect(x.capture).not.toHaveBeenCalled(); expect(x.store.snapshot().phase).toBe('idle');
  await x.store.open(x.balance); expect(x.session.read).toHaveBeenCalledTimes(1);
  x.balance.assets[0].decimals = 6; x.balance.account.id = createResourceId('walletAccount');
  expect(x.store.snapshot().form?.balance.assets[0].decimals).toBe(18);
  expect(x.store.snapshot().form?.selected.wallet_account_id).toBe(x.account.id);
  vi.spyOn(Date,'now').mockReturnValue((x.f.now+100)*1000);
  x.store.checkSession(); expect(x.store.snapshot().phase).toBe('open');
  await x.store.open(null); expect(x.session.read).toHaveBeenCalledTimes(1);
 });
 it.each(['wallet','account','network','expired','future','missing'])('rejects %s balance before I/O', async fault => {
  const x = fixture();
  if (fault === 'wallet') x.balance.account.wallet_id = createResourceId('wallet');
  if (fault === 'account') x.balance.account.id = createResourceId('walletAccount');
  if (fault === 'network') x.balance.account.network_id = 'eip155:1';
  if (fault === 'expired') vi.spyOn(Date,'now').mockReturnValue(x.balance.expires_at*1000);
  if (fault === 'future') vi.spyOn(Date,'now').mockReturnValue((x.f.now-1)*1000);
  await x.store.open(fault === 'missing' ? null : x.balance);
  expect(x.store.snapshot().phase).toBe('error'); expect(x.capture).not.toHaveBeenCalled();
 });
 it('rejects crossed context and permits an explicit retry', async () => {
  const x = fixture(); x.session.read.mockResolvedValueOnce({ ...x.selected,wallet_account_id:createResourceId('walletAccount') });
  await x.store.open(x.balance); expect(x.store.snapshot().form).toBeNull(); expect(x.store.snapshot().phase).toBe('error');
  await x.store.open(x.balance); expect(x.store.snapshot().phase).toBe('open');
 });
 it('suppresses double clicks and late responses after disposal', async () => {
  const x = fixture(); let resolve!:(value:typeof x.selected) => void;
  x.session.read.mockImplementation(() => new Promise(done => { resolve = done; }));
  const first = x.store.open(x.balance); await x.store.open(x.balance); expect(x.session.read).toHaveBeenCalledTimes(1);
  x.store.dispose(); resolve(x.selected); await first;
  expect(x.store.snapshot()).toEqual({ phase:'closed',form:null,error:null });
 });
 it('discards same-UID session replacement during and after a read', async () => {
  const x = fixture();
  x.session.read.mockImplementation(async () => { x.session.assertCurrent.mockImplementation(() => { throw Object.assign(new Error(),{ code:'auth/session-changed' }); }); return x.selected; });
  await x.store.open(x.balance); expect(x.store.snapshot().phase).toBe('closed'); expect(x.store.snapshot().form).toBeNull();
  const y = fixture(); await y.store.open(y.balance); y.session.assertCurrent.mockImplementation(() => { throw new Error(); }); y.store.checkSession();
  expect(y.store.snapshot().phase).toBe('closed'); expect(y.store.snapshot().form).toBeNull();
 });
 it('cancellation ends the owned read and cannot reopen the disposed component', async () => {
  const x = fixture(); let signal:AbortSignal|undefined;
  x.session.read = vi.fn(async (_account?:unknown,inputSignal?:AbortSignal) => { signal = inputSignal; x.store.dispose(); return x.selected; });
  await x.store.open(x.balance); expect(signal?.aborted).toBe(true); await x.store.open(x.balance);
  expect(x.session.read).toHaveBeenCalledTimes(1); expect(x.store.snapshot().form).toBeNull();
 });
 it.each([true,false])('renders an inert send entry English=%s', english => {
  const x = fixture(), runtime = { accountContexts:vi.fn(),subscribe:vi.fn() };
  const html = renderToStaticMarkup(createElement(TransferEntry,{ runtime:runtime as unknown as BrowserAuth,uid:'synthetic',account:x.account,balance:x.balance,english }));
  expect(html).toContain(english ? 'Send' : 'Enviar'); expect(runtime.accountContexts).not.toHaveBeenCalled();
 });
 it('pins the deployed Sepolia account revision only in staging', () => {
  const pins = accountPinsForRelease(parseEnvironment(environments.staging));
  expect(pins).toHaveLength(1);
  expect(JSON.parse(pins[0].document).components.factory.address).toBe('0x61c74d8f0834791db732fba9ac022224bf3bbb5f');
  const creation = creationProfileForRelease(parseEnvironment(environments.staging))!;
  const profile = loadPinnedCreationProfile(creation.document, creation.digest);
  const document = JSON.stringify(profile.deployment);
  expect(pins[0]).toEqual({ document, digest: deploymentDocumentDigest(document) });
  expect(accountPinsForRelease(parseEnvironment(environments.production))).toEqual([]);
 });
});
