import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { cose, decodeCredentialPublicKey } from '@simplewebauthn/server/helpers';
import { bytesToHex, concatHex, hexToBytes, sha256, stringToHex, type Hex } from 'viem';
import { encodeWebAuthnAssertion, type WebAuthnScope } from '@gatopago/shared/v3/webauthn';

export async function verifyEnrollment(
  input: unknown,
  expected: { scope: WebAuthnScope; challenge: Hex; proofChallenge: Hex },
) {
  const body = input as {
    credential_id: string;
    client_data: string;
    attestation: string;
    transports: ('internal' | 'hybrid')[];
    proof: { authenticator_data: string; client_data: string; signature: string };
  };
  const bytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));
  const result = await verifyRegistrationResponse({
    response: {
      id: body.credential_id,
      rawId: body.credential_id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: body.client_data,
        attestationObject: body.attestation,
        transports: body.transports,
      },
    },
    expectedOrigin: expected.scope.origin,
    expectedRPID: expected.scope.rpId,
    expectedChallenge: Buffer.from(hexToBytes(expected.challenge)).toString('base64url'),
    requireUserVerification: true,
    requireUserPresence: true,
    supportedAlgorithmIDs: [-7],
  });
  if (!result.verified) throw new Error('invalid fixture registration');
  const info = result.registrationInfo;
  const key = decodeCredentialPublicKey(info.credential.publicKey);
  if (
    !cose.isCOSEPublicKeyEC2(key) ||
    key.get(cose.COSEKEYS.alg) !== -7 ||
    key.get(cose.COSEKEYS.crv) !== 1
  )
    throw new Error('invalid fixture key');
  const x = key.get(cose.COSEKEYS.x),
    y = key.get(cose.COSEKEYS.y);
  if (
    !(x instanceof Uint8Array) ||
    !(y instanceof Uint8Array) ||
    x.length !== 32 ||
    y.length !== 32
  )
    throw new Error('invalid fixture coordinates');
  const publicKey = concatHex([
    sha256(stringToHex(expected.scope.rpId)),
    sha256(stringToHex(expected.scope.origin)),
    bytesToHex(x),
    bytesToHex(y),
  ]);
  const response = {
    authenticatorData: bytes(body.proof.authenticator_data),
    clientDataJSON: bytes(body.proof.client_data),
    signatureDER: bytes(body.proof.signature),
  };
  encodeWebAuthnAssertion({
    scope: expected.scope,
    key: publicKey,
    challenge: expected.proofChallenge,
    response,
  });
  return {
    credentialId: body.credential_id,
    publicKey,
    transports: body.transports,
    aaguid: info.aaguid,
    backupEligible: info.credentialDeviceType === 'multiDevice',
    backedUp: info.credentialBackedUp,
    signCount: new DataView(response.authenticatorData.buffer).getUint32(33, false),
    responseHash: sha256(stringToHex(JSON.stringify(body))),
  };
}
