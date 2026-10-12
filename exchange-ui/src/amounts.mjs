const DECIMALS = 9;
const MAX_U64 = 18_446_744_073_709_551_615n;

export function parseUnits(value, decimals = DECIMALS) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(trimmed)) return null;

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return null;

  try {
    const units = BigInt(whole) * 10n ** BigInt(decimals) +
      BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
    return units > 0n && units <= MAX_U64 ? units : null;
  } catch {
    return null;
  }
}

export function formatUnits(value, decimals = DECIMALS, precision = 6) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, precision);
  const readableFraction = fraction.replace(/0+$/, '');
  return readableFraction ? `${whole.toLocaleString()}.${readableFraction}` : whole.toLocaleString();
}

export function minimumReceived(amount, slippageBps = 50n) {
  return amount * (10_000n - slippageBps) / 10_000n;
}

export function isEternoCoinType(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}::eterno::ETERNO$/.test(value.trim());
}
