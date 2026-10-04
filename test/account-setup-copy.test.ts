import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';

describe('account setup explanations match the Consumer creation policy', () => {
  it('describes one authorized passkey and optional backup in both languages', () => {
    const policy = prepareInitialization(initializationFixture().input).policy;
    expect(policy.mode).toBe('active');
    expect(policy.signers).toHaveLength(1);
    expect(policy.spendThreshold).toBe(1);
    const source = readFileSync(
      new URL('../src/wallet/AccountInitialization.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('One access key is enough');
    expect(source).toContain('Una sola llave de acceso basta');
    expect(source).toContain('An additional access key is optional');
    expect(source).toContain('Una llave de acceso adicional es opcional');
    expect(source).toContain('GatoPago cannot restore access');
    expect(source).toContain('GatoPago no puede restablecer el acceso');
    expect(source).not.toMatch(
      /independent-factor backup|activación separada con factor independiente|Account V3 in initial mode/,
    );
  });
  it('distinguishes registering a credential from adding an onchain signer', () => {
    const source = readFileSync(
      new URL('../src/wallet/SecurityEnrollment.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('does not create an onchain account or add a signer');
    expect(source).toContain('no crea una cuenta onchain ni añade un firmante');
    expect(source).toContain('adding a backup is optional');
    expect(source).toContain('añadir un respaldo es opcional');
    expect(source).not.toContain('La activación de la cuenta es un paso separado');
  });
});
