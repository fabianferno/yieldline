# Arc testnet + Circle stack (verified 2026-10-16)

- Chain ID 5042002 · RPC https://rpc.testnet.arc.io · WS wss://rpc.testnet.arc.io
- Explorer (Blockscout, /api + /api/v2): https://explorer.testnet.arc.io · Faucet: https://faucet.circle.com
- Gas paid in USDC. Native balance = 18 decimals; ERC-20 USDC `0x3600000000000000000000000000000000000000` = 6 decimals. Contracts use ERC-20 only.
- EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`; Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`; Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- viem >= 2.40: `import { arcTestnet } from "viem/chains"`
- Compile with evm_version = "paris" (PUSH0 caveat, unconfirmed for Foundry)

## USYC (testnet)
Token `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` · Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` · Entitlements `0xcc205224862c7641930c87679e98999d23c26113`
`deposit(uint256 assets, address receiver)` / `redeem(uint256 shares, address receiver, address account)`. Requires allowlisting via support.circle.com (24–48h). Plan: Teller-shaped adapter, mock until allowlisted.

## Circle Wallets / Contracts
Blockchain id `ARC-TESTNET`. `@circle-fin/developer-controlled-wallets`, `@circle-fin/smart-contract-platform`. SCP importContract + createEventMonitor (`contracts.eventLog` webhooks) — likely supported on testnet, verify.

## Gateway (domain 26)
GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` · GatewayMinter `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`

## ERC-8004 (testnet)
Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` · Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` · Validation `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`
Tutorial: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent

## Hackathon
Submit: https://forms.gle/BBWrdfuircrKiG2i6 by Oct 17 11:59 PM ET. Prior art #04 Horoi = publish receivables claims so credit reflects total debt. RFB 2/3 tie-in.
