import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import type { RouterDataV3 } from '@cetusprotocol/aggregator-sdk';
import { isEternoCoinType } from './amounts.mjs';

export const SUI_TYPE = '0x2::sui::SUI';
export const SLIPPAGE = 0.005;
export const QUOTE_TTL_MS = 30_000;
const RPC_URLS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
} as const;

async function createAggregatorClient(network: Network) {
  const { AggregatorClient, Env } = await import('@cetusprotocol/aggregator-sdk');
  return new AggregatorClient({
    env: network === 'mainnet' ? Env.Mainnet : Env.Testnet,
    client: new SuiGrpcClient({ network, baseUrl: RPC_URLS[network] }),
  });
}

export type Network = keyof typeof RPC_URLS;
export type Direction = 'sui-to-e' | 'e-to-sui';

export type SwapQuote = {
  router: RouterDataV3;
  network: Network;
  inputAmount: bigint;
  outputAmount: bigint;
  createdAt: number;
  fromType: string;
  toType: string;
};

export function tokenTypeFor(network: Network): string | null {
  const configured = network === 'mainnet'
    ? import.meta.env.VITE_E_TOKEN_TYPE_MAINNET
    : import.meta.env.VITE_E_TOKEN_TYPE_TESTNET;
  if (!configured) return null;

  const type = configured.trim();
  return isEternoCoinType(type) ? type : null;
}

export async function requestQuote(
  network: Network,
  direction: Direction,
  amount: bigint,
  eType: string,
): Promise<SwapQuote> {
  const fromType = direction === 'sui-to-e' ? SUI_TYPE : eType;
  const toType = direction === 'sui-to-e' ? eType : SUI_TYPE;
  const client = await createAggregatorClient(network);
  const BN = (await import('bn.js')).default;
  const router = await client.findRouters({
    from: fromType,
    target: toType,
    amount: new BN(amount.toString()),
    byAmountIn: true,
    slippage: SLIPPAGE,
  });

  if (!router || router.insufficientLiquidity || router.amountOut.isZero()) {
    throw new Error('No tradable route is available for this pair and amount. The token may not be deployed or have liquidity yet.');
  }

  return {
    router,
    network,
    inputAmount: amount,
    outputAmount: BigInt(router.amountOut.toString()),
    createdAt: Date.now(),
    fromType,
    toType,
  };
}

export async function buildSwapTransaction(quote: SwapQuote): Promise<Transaction> {
  const tx = new Transaction();
  const client = await createAggregatorClient(quote.network);
  await client.fastRouterSwap({
    router: quote.router,
    txb: tx,
    slippage: SLIPPAGE,
  });
  return tx;
}
