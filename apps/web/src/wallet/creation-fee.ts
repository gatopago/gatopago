import { atomicToDecimal, decimalToAtomic } from '@gatopago/shared/v3/amount';

// Presentation units only. These entries do not admit a network or a contract.
// Real creation still requires the compiled profile AND Wallet Core admission.
const units = Object.freeze({
  'eip155:84532': Object.freeze({ network: 'Base Sepolia', symbol: 'ETH', decimals: 18 }),
  'eip155:421614': Object.freeze({ network: 'Arbitrum Sepolia', symbol: 'ETH', decimals: 18 }),
  'eip155:43113': Object.freeze({ network: 'Avalanche Fuji', symbol: 'AVAX', decimals: 18 }),
});
export function creationFeeUnit(network: string) {
  return Object.hasOwn(units, network) ? units[network as keyof typeof units] : null;
}
export function parseCreationFee(value: string, network: string): string {
  const unit = creationFeeUnit(network);
  try {
    if (!unit || value.length > 100) throw new Error('Invalid cap');
    const amount = decimalToAtomic(value, unit.decimals);
    if (amount === '0') throw new Error('Positive cap required');
    return amount;
  } catch { throw new Error('creation/invalid-cap'); }
}
export function formatCreationFee(amount: bigint, network: string): string {
  const unit = creationFeeUnit(network);
  if (!unit || amount < 0n || amount >= 1n << 256n) throw new Error('creation/invalid-cap');
  return `${atomicToDecimal(amount.toString(), unit.decimals)} ${unit.symbol}`;
}
