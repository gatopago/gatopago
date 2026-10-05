import { describe, expect, it } from 'vitest';
import { bytesToHex, concat, hexToBytes, sha256, stringToHex } from 'viem';
import { recoverPublicKeys } from '../src/wallet/passkey';

describe('passkey public key recovery', () => {
  it('finds the signing key among the candidates of a WebAuthn assertion', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ]);
    const publicKey = bytesToHex(
      new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)).slice(1),
    );
    const metadata = {
      authenticatorData: `${sha256(stringToHex('gatopago.com'))}0500000000` as const,
      clientDataJSON:
        '{"type":"webauthn.get","challenge":"3q2-7w","origin":"https://gatopago.com","crossOrigin":false}',
    };
    const signed = concat([
      metadata.authenticatorData,
      sha256(stringToHex(metadata.clientDataJSON)),
    ]);
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new Uint8Array(hexToBytes(signed)),
      ),
    );
    const candidates = recoverPublicKeys(metadata, {
      r: BigInt(bytesToHex(signature.slice(0, 32))),
      s: BigInt(bytesToHex(signature.slice(32))),
    });
    expect(candidates).toHaveLength(2);
    expect(candidates).toContain(publicKey);
  });
});
