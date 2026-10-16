# x402 on Arc (verified against source, 2026-10-16)

- Network id `eip155:5042002`; USDC `0x3600…0000` (EIP-3009, name "USDC", version "2").
- `circlefin/arc-x402-circle-wallets` is README-only. Working reference: `circlefin/arc-nanopayments`.
- Packages: `@x402/core|evm|express|fetch@2.28.0` (v2). Avoid legacy `x402`, `x402-express` 1.x.

## Path A — standard "exact" (CHOSEN for Splitter model)
- Settlement = `USDC.transferWithAuthorization(to = payTo)` → funds land directly on payTo; contract payTo OK (no EOA check on payee).
- No public facilitator supports Arc testnet → we self-host one with `@x402/evm/exact/facilitator` (needs a USDC-funded gas wallet).
- Receipts indexable: Blockscout `/api/v2/addresses/{addr}/token-transfers?type=ERC-20&filter=to` or `/api?module=account&action=tokentx`.

## Path B — Circle Gateway Nanopayments (batched)
- Facilitator `https://gateway-api-testnet.circle.com/v1/x402/{verify,settle,supported}`, extra `{name:"GatewayWalletBatched", version:"1", verifyingContract: GatewayWallet}`.
- Seller receives an internal Gateway balance (submitBatch nets deltas), not an ERC-20 Transfer. Withdraw via GatewayMinter.
- Unsettled receivables PUBLIC: `GET /v1/x402/transfers?network=eip155:5042002&to=<seller>&status=received` (statuses received|batched|confirmed|completed|failed).
- Contract as payTo: unconfirmed (closed facilitator). Possible via Splitter as Gateway depositor + `addDelegate`.
- Use for: receivables-aware underwriting signal (nice-to-have).

## Discovery
CDP Bazaar `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (public) — Arc mainnet entries only. We monitor sellers' live 402 responses directly.
