# Eterno Swap

A non-custodial React app for quoting and swapping between SUI and Eterno on Sui. The app uses the Sui dApp Kit wallet connection and Cetus Plus Aggregator SDK to find a route across supported Sui DEX liquidity. The connected wallet reviews and signs every transaction; the app never receives or stores private keys.

## Current availability

Eterno is not deployed on mainnet, and no Eterno/SUI liquidity pool is configured. Therefore live Eterno quotes and swaps are not currently available. This app intentionally disables quotes until a network-specific Eterno coin type is configured and verifies the on-chain metadata (`Eterno`, `E`, 9 decimals) before enabling swaps. Even after deployment, a route only exists after sufficient liquidity is available on a supported Sui DEX.

Testnet trading is for smoke testing only and requires a testnet E coin type and a testnet liquidity route. Mainnet trades use real assets and SUI gas.

## Run locally

Requirements: Node.js 24 or newer and npm.

```powershell
cd exchange-ui
npm ci
Copy-Item .env.example .env.local
```

After publishing Eterno on a network, set only the matching coin type in `.env.local`:

```dotenv
VITE_E_TOKEN_TYPE_TESTNET=0x<testnet-package-id>::eterno::ETERNO
VITE_E_TOKEN_TYPE_MAINNET=0x<mainnet-package-id>::eterno::ETERNO
```

Leave the mainnet value empty until the official mainnet package has been published and independently verified. Never place wallet credentials or recovery phrases in this file. Restart the dev server after changing environment variables.

```powershell
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. Choose Testnet or Mainnet explicitly, connect a Sui wallet, enter an amount, and request a quote. Review the expected output, 0.5% slippage tolerance, minimum received amount, selected network, and quote expiry. Selecting **Review & swap** opens the connected wallet for transaction review and signing. The app cannot sign on your behalf. Keep extra SUI in the wallet for gas; `MAX` leaves a small SUI reserve when SUI is the input.

The live route request is sent to Cetus's aggregator service with the coin types, amount, and selected network. No secret key is sent. The service and the Sui network can observe public transaction and quote information. A quote is time-limited and is not a guarantee of execution price.

## Safety and limitations

- The app is non-custodial. It does not collect recovery phrases, use a backend signer, or automatically submit transactions.
- Verify the selected network and token metadata before requesting or signing a swap. Your wallet is the final authority for transaction approval.
- Swaps can fail or execute at the quoted minimum due to price movement, slippage, liquidity, or gas conditions. Use amounts you can afford to lose.
- The chart area is explicitly illustrative; it is not market-price history. No price oracle or historical chart API is integrated.
- No Eterno liquidity pool is created by this app. Pool creation and liquidity provision are separate on-chain transactions that require a deliberate asset allocation.
- The existing Eterno supply is fixed at 999,999 E. The UI does not mint tokens or bridge E to other chains.

## Implementation

- `@mysten/dapp-kit-react` for wallet discovery, connection, network selection, and wallet-mediated transaction signing.
- `@cetusprotocol/aggregator-sdk` for fresh route quotes and transaction construction.
- `@mysten/sui` version is pinned and deduplicated with the aggregator SDK to keep transaction/client types consistent.

See the [Cetus Plus Aggregator documentation](https://cetus-1.gitbook.io/cetus-developer-docs/developer/cetus-plus-aggregator) and [Sui dApp Kit documentation](https://sdk.mystenlabs.com/sui/dapp-kit).
