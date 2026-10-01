import { afterEach,describe,expect,it,vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { transferFixture } from '@gatopago/test-fixtures/v3-transfer';
import { buildAuthConfig,type EnabledAuthConfig } from '../src/auth/config';
import { accountContextClient,parseAccountContext } from '../src/wallet/account-context';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
 const f = transferFixture(true), selected = { id:createResourceId('walletAccount'),wallet_id:f.request.wallet_id,network_id:f.request.network_id };
 const pin = { document:f.approval.security_evidence.document,digest:f.context.deployment_digest };
 const wire = { schema_version:1,wallet_id:selected.wallet_id,wallet_account_id:selected.id,network_id:selected.network_id,
  account_id:f.context.account_id,address:f.context.account,deployment:{ ...pin },spend_readiness:'not_assessed',receive_enabled:false,send_enabled:false };
 const config = buildAuthConfig(parseEnvironment({ ...environments.staging,status:'provisioned',firebase_project_id:'v3-runtime-test' }),{
  apiKey:`AIza${'a'.repeat(35)}`,appId:'1:123:web:abcdef',turnstileSiteKey:`0x${'a'.repeat(22)}` }) as EnabledAuthConfig;
 return { f,selected,pin,wire,config };
}
describe('Consumer owned account context', () => {
 it('matches a separately pinned release and derives the actual address', () => {
  const x = fixture(), result = parseAccountContext(x.wire,x.selected,[x.pin]);
  expect(result).toEqual({ wallet_id:x.selected.wallet_id,wallet_account_id:x.selected.id,network_id:x.selected.network_id,
   account_id:x.f.context.account_id,address:x.f.context.account,deployment:x.pin });
  x.wire.deployment.document = 'changed'; expect(result.deployment.document).toBe(x.pin.document);
 });
 it.each(['wallet','instance','network','account','address','pin','document','grant','extra','provider','no-admission','duplicate-admission'])(
  'rejects %s',fault => {
   const x = fixture();
   if (fault === 'wallet') x.wire.wallet_id = createResourceId('wallet');
   if (fault === 'instance') x.wire.wallet_account_id = createResourceId('walletAccount');
   if (fault === 'network') x.wire.network_id = 'eip155:1';
   if (fault === 'account') x.wire.account_id = `0x${'ab'.repeat(32)}`;
   if (fault === 'address') x.wire.address = `0x${'ab'.repeat(20)}`;
   if (fault === 'pin') x.wire.deployment.digest = `0x${'ab'.repeat(32)}`;
   if (fault === 'document') x.wire.deployment.document += ' ';
   if (fault === 'grant') x.wire.send_enabled = true;
   if (fault === 'extra') Object.assign(x.wire,{ initial_security_commitment:'unexpected' });
   if (fault === 'provider') Object.assign(x.wire.deployment,{ rpc_url:'https://example.test' });
   expect(() => parseAccountContext(x.wire,x.selected,fault === 'no-admission' ? [] : fault === 'duplicate-admission' ? [x.pin,x.pin] : [x.pin])).toThrow();
  });
 it('captures selection and pins before token I/O and performs one read', async () => {
  const x = fixture(), id = x.selected.id, fetcher = vi.fn().mockResolvedValue(Response.json(x.wire)); vi.stubGlobal('fetch',fetcher);
  const client = accountContextClient(x.config,async () => { x.selected.id = createResourceId('walletAccount'); x.pin.document = 'changed'; return 'synthetic'; },[x.pin]);
  const result = await client.read(x.selected,new AbortController().signal);
  expect(result.wallet_account_id).toBe(id); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain(`/accounts/${id}/context`);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method:'GET',cache:'no-store',credentials:'omit',redirect:'error' });
 });
 it.each(['no-admission','cancelled'])('does no I/O for %s', async fault => {
  const x = fixture(), token = vi.fn(), controller = new AbortController(); if (fault === 'cancelled') controller.abort();
  await expect(accountContextClient(x.config,token,fault === 'no-admission' ? [] : [x.pin]).read(x.selected,controller.signal)).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
 });
});
