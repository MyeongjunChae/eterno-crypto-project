export function parseUnits(value: string, decimals?: number): bigint | null;
export function formatUnits(value: bigint, decimals?: number, precision?: number): string;
export function minimumReceived(amount: bigint, slippageBps?: bigint): bigint;
export function isEternoCoinType(value: unknown): value is string;
