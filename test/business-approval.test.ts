import { describe, expect, it } from 'vitest';
import { parseSiweMessage } from 'viem/siwe';
import { approvalMessage, businessRequest } from '../src/consumer/ApproveScreen';

describe('Approving a GatoPago Business sign-in', () => {
  it('accepts only the request ids the console shows', () => {
    expect(businessRequest('0123456789abcdef0123456789abcdef')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
    for (const value of [null, '', 'pi_123', '0123456789ABCDEF0123456789ABCDEF', '../app'])
      expect(businessRequest(value)).toBeNull();
  });

  it("signs the app's domain with the request as nonce, as Wallet Core checks it", () => {
    const message = parseSiweMessage(
      approvalMessage({
        webOrigin: 'https://gatopago.com',
        address: '0x75464f762bc50d0A0B127ab5a085504BF102Bb88',
        chainId: 421614,
        request: '0123456789abcdef0123456789abcdef',
      }),
    );
    expect(message).toMatchObject({
      domain: 'gatopago.com',
      uri: 'https://gatopago.com',
      chainId: 421614,
      nonce: '0123456789abcdef0123456789abcdef',
      address: '0x75464f762bc50d0A0B127ab5a085504BF102Bb88',
    });
  });
});
