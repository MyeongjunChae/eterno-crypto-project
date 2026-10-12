import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const RPC_URLS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
} as const;

export const dAppKit = createDAppKit({
  networks: ['testnet', 'mainnet'],
  defaultNetwork: 'testnet',
  createClient(network) {
    return new SuiGrpcClient({ network, baseUrl: RPC_URLS[network] });
  },
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
