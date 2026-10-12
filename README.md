# Eterno (E)

Eterno is a fixed-supply fungible currency for Sui, created with the Sui Currency standard.

| Property | Value |
| --- | --- |
| Name | Eterno |
| Symbol | E |
| Decimals | 9 |
| Initial and maximum supply | 999,999 E |
| Raw on-chain supply | 999,999,000,000,000 base units |
| Minting and burning after creation | Permanently disabled |

The source creates the entire supply during package publication. It then converts the treasury capability into the Currency Registry's fixed-supply state and permanently deletes the metadata capability. There is no issuer mint, burn, pause, or deny-list function. The minted coin is transferred to the address that publishes the package.

## Important

Publishing to mainnet is a public, irreversible transaction that spends SUI for gas. Review and test the source on testnet first. This repository does not contain a wallet, key, seed phrase, or signing automation; signing must happen in your own Sui CLI environment. **This project has not been deployed to mainnet.**

Source code, package and transaction data, token type, balances, and other on-chain activity are public and generally permanent. Do not put private keys, seed phrases, wallet files, personal information, or private configuration in this repository. Creating a token does not guarantee value, liquidity, exchange listings, or legal compliance. Check applicable laws and tax obligations before issuance or promotion.

## Prerequisites

- A current Sui CLI with Move 2024 support, installed from the [official Sui documentation](https://docs.sui.io/guides/developer/getting-started).
- A Sui address and enough SUI for gas on the selected network.

The Move package resolves the Sui framework from its `framework/mainnet` branch. For a reproducible release, build and test with a recorded Sui CLI version and reviewed dependency lockfile.

## Build and test

From this directory:

```powershell
sui --version
sui move build
sui move test
```

The unit test checks that the configured raw amount equals `999,999 × 10^9` and represents exactly 999,999 whole Eterno. The Move build and test commands also validate the package against the resolved Sui framework.

## Testnet smoke test

First ensure the CLI has a testnet environment and a funded testnet address. If needed, add the environment and request testnet SUI using the official faucet:

```powershell
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
sui client active-address
```

Inspect the active address before proceeding. Then publish the package:

```powershell
sui client publish --gas-budget 100000000
```

The publish transaction runs `init`, creates and fixes the supply, deletes the metadata capability, and sends the entire supply to the publishing address. In the publish effects, locate the newly created `Currency<...::eterno::ETERNO>` object transferred to `0x2`; record its object ID and the published package ID.

The OTW-based Currency standard uses a second transaction to register that Currency in the shared registry. Substitute the two IDs from the publish result:

```powershell
sui client ptb --assign currency_to_promote "@0xCURRENCY_OBJECT_ID" --move-call 0x2::coin_registry::finalize_registration "0xPACKAGE_ID::eterno::ETERNO" "@0xc" currency_to_promote --gas-budget 100000000
```

Check the transaction effects and the Sui explorer for the shared Currency, its `E` metadata, the publisher's received coin, and the fixed supply state. The registration call is permissionless and only completes metadata registration; it cannot mint or change the supply.

## Mainnet deployment

Only after the build, tests, testnet publish, registration, and on-chain checks are satisfactory:

1. Switch to mainnet and verify the network and active address. Confirm the address is yours and has enough SUI for gas.
2. Rebuild and test the exact source you intend to publish.
3. Run the publish command below and review/approve the transaction using your own CLI signer. This runs the package initializer and creates the 999,999 E supply in that transaction.
4. Use the resulting Currency object ID and package ID in the registry-finalization PTB shown above, then verify the transaction effects and on-chain state.

```powershell
sui client switch --env mainnet
sui client active-address
sui move build
sui move test
sui client publish --gas-budget 100000000
```

If mainnet has not been configured yet, add the official mainnet fullnode first with `sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443`. Verify `sui client active-env` and `sui client active-address` before signing. Review the CLI's transaction summary before approving; never paste a key or recovery phrase into chat or commit it here.

The fixed-supply state prevents further minting and burning through the Sui Currency framework. Do not claim that the token is live until the mainnet publish and registry-registration transactions both succeed and their effects have been independently checked.

## AI-assisted route recommendations

The separate `route-advisor` Node.js tool lets an AI compare current route quotes for Sui, Ethereum, and Solana. It accepts one of four objectives (`balanced`, `lowest-fee`, `fastest`, or `highest-liquidity`), ignores expired routes, rejects quote sets older than 60 seconds, and only accepts a recommendation whose route ID exists in the supplied quotes. It does not sign, submit, or execute transactions.

Ethena is a protocol/venue, not a blockchain network. Represent it as a route's optional `protocol` field on the network where that route actually operates. The advisor does not fetch route quotes itself: an integration must obtain live, transaction-specific quotes from a trusted provider and pass them in the JSON format below. No provider or bridge has been selected or integrated yet.

Run the advisor from `route-advisor` with Node.js 20 or newer:

```powershell
npm test
$env:AI_API_KEY = "<your-provider-key>"
$env:AI_MODEL = "<model-supported-by-your-provider>"
node .\src\cli.mjs .\fresh-quotes.json
```

`AI_BASE_URL` is optional and defaults to the OpenAI-compatible `https://api.openai.com/v1` endpoint. Set credentials only in your local environment, never in source control. The quote metadata is sent to that AI provider for analysis; do not include personal or secret data. Example quote input shape:

```json
{
  "asOf": "timestamp supplied by your quote integration",
  "objective": "balanced",
  "operation": "the exact operation being quoted",
  "routes": [
    {
      "id": "provider-issued-unique-route-id",
      "network": "sui",
      "protocol": "optional protocol or venue",
      "provider": "quote-provider-name",
      "feeUsd": 0.01,
      "etaSeconds": 5,
      "liquidityUsd": 100000,
      "expiresAt": "provider quote expiry timestamp"
    }
  ]
}
```

The numbers above illustrate the input format only; they are not live quotes. Obtain fee, completion time, liquidity, and expiry from the same trusted provider's current quote for the exact operation. The AI selects among those quoted options; it does not supply or change the quote data.

The Eterno contract in this repository exists only for Sui. The advisor alone cannot move Eterno to another chain. Before adding cross-chain Eterno routes, select and audit a bridge/issuer design that accounts for the 999,999-token cap across **all** networks. Deploying independent supplies on Sui, Ethereum, and Solana would multiply the total supply and violate the fixed-supply promise. No bridge, wrapped Eterno, or other-chain token deployment is included here.

## Project layout

```text
Move.toml
sources/eterno.move
route-advisor/
  package.json
  src/
  test/
```
