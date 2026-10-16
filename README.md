# ΟΡΟΣ · Horos

**Working capital for businesses that earn through x402.** An agent advances USDC against a seller's proven
x402 revenue on Arc, repayment is swept automatically from every incoming payment, and every advance is published
as a public on-chain lien so no one can borrow twice against the same revenue.

Built for the Tameion Agents Hackathon (Canteen × Circle). Runs on **Arc testnet**, settles in **USDC**, and uses
**Circle Wallets** for every agent action and every buyer signature.

> In ancient Attica a *horos* was a boundary stone set on mortgaged land, recording the debt for any future lender
> to read. Horos does the same for on-chain revenue (Tameion prior art #04, *Horoi*).

---

## Why

x402 sellers (paid APIs, MCP tools, datasets) have revenue that is on-chain, per-call and real-time: the best
possible data for cash-flow underwriting, and nobody lends against it. Horos lends to businesses that **earn**,
against what they earn, and makes every lien public so credit can be priced against everything a business owes.

## The loop

```
 buyers ──x402──▶ seller endpoint (402: payTo = RevenueSplitter)
                        │  EIP-3009 transferWithAuthorization, settled by the Horos facilitator
                        ▼
                 RevenueSplitter ── split() ──▶ sweepBps% ─▶ LenderPool (until repay cap)
                        │                    └─▶ rest ─────▶ seller wallet
                        ▼
                  LienRegistry  (public: seller, payTo, principal, cap, repaid, status, record)
```

1. **Underwrite.** The underwriting agent (Claude Haiku) pulls the seller's x402 receipts from Arc, runs payer
   forensics, checks the lien registry and pool limits, probes the live 402 endpoint, then offers, rejects or
   escalates, with a written rationale that cites the numbers.
2. **Accept.** A per-seller `RevenueSplitter` is deployed. The seller points x402 `payTo` at it.
3. **Verify, then fund.** The agent re-probes the seller's live 402 challenge and disburses only once buyers are
   actually being asked to pay the splitter. Lien opens in the registry.
4. **Sweep.** Every payment lands in the splitter; the facilitator (acting as keeper) calls the permissionless
   `split()`. `sweepBps` goes to the pool until the cap is reached, the rest goes to the seller.
5. **Monitor.** The monitoring agent watches every live lien's endpoint and repayment pace and decides:
   continue / adjust sweep / **freeze** / unfreeze / escalate default, with reasons.
6. **Close.** At the cap the lien is released (`Repaid`) and the seller's public record improves.

## What the agents decide

| Agent | Decides | Hard limits it cannot cross (enforced in `LenderPool`) |
|---|---|---|
| Underwriter | Is the revenue real? Advance size, sweep %, flat fee, term, or reject / escalate | max advance, ≤ X% of NAV per seller, sweep bounds, fee cap, max term, no second lien |
| Monitor | Continue, change sweep, freeze on diversion, unfreeze, recommend default | sweep bounds; **default is human-only** |
| Treasury | Park idle USDC in USYC or recall it for the advance pipeline | — |
| Human | Approves advances above the auto-approve limit; marks defaults | — |

Every decision is written to `agent/data/decisions.jsonl` with the full investigation trace, and published on
chain via `LenderPool.logDecision(subject, kind, keccak(record), summaryJSON)`: the rationale is readable straight from
Arc, and the hash commits to the full trace.

### Wash-trading detection

Revenue only counts if it is **x402** (settled via `transferWithAuthorization`) and **arm's-length**. Per payer,
the agent sees wallet age, other activity, who funded it, whether the seller funded it, whether the lender's own
operator funded it, shared funders, concentration (HHI) and timing regularity. A shared *public faucet* funder is
treated as neutral.

Real example on Arc testnet: a seller whose three "customers" were funded by the seller itself was rejected at
risk 95 ("self-dealing rather than arm's-length revenue"). The same agent also refused to advance against
Horos's own early traffic, because those payers were funded by the lender's operator wallet.

### Diversion (the big risk)

The seller controls `payTo` and can point it back at their own wallet at any time. Horos answers in three layers:

1. **Monitor:** the live 402 challenge is probed every tick. A `payTo` other than the splitter triggers an
   immediate **freeze**: public in the registry, and the splitter sweeps 100% of anything that still arrives.
2. **Lien-aware facilitator:** the Horos x402 facilitator refuses to verify or settle a payment addressed to a
   seller's own wallet while that seller has a live lien, and tells the buyer which splitter to pay instead.
3. **Public record:** freezes and defaults are permanent entries in the seller's registry record, readable by every
   other lender (and sold per call by the Horos Lien Oracle).

## Circle stack

- **Circle Wallets (developer-controlled, `ARC-TESTNET`):** the underwriting and monitoring agents sign every
  on-chain action through Circle (`createContractExecutionTransaction`), and buyers sign x402 EIP-3009
  authorizations through Circle `signTypedData` (`agent/src/circle.ts`).
- **USDC on Arc:** all advances, sweeps, fees and x402 payments are in USDC; gas is paid in USDC.
- **USYC:** the treasury agent parks idle pool liquidity via the Teller interface (`deposit` / `redeem`). The pool
  wallet is pending testnet allowlisting, so a `MockUSYCTeller` with the same interface stands in;
  `LenderPool.setTeller` swaps it for the real Teller in one call.
- **x402 on Arc:** `@x402/*` v2. No public facilitator supports `eip155:5042002` for the exact scheme, so Horos runs its own.

## Deployed (Arc testnet, chain 5042002)

| Contract | Address |
|---|---|
| LienRegistry | [`0xD140eED8f20B2157366B36FcC08226d64c16906F`](https://explorer.testnet.arc.io/address/0xD140eED8f20B2157366B36FcC08226d64c16906F) |
| LenderPool | [`0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506`](https://explorer.testnet.arc.io/address/0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506) |
| MockUSYCTeller | [`0x6be95DA212b7F77C1947b436Be9C5EC35727A4D5`](https://explorer.testnet.arc.io/address/0x6be95DA212b7F77C1947b436Be9C5EC35727A4D5) |

All verified on Blockscout. Agent and buyer Circle wallets are listed in `agent/src/deployments.ts`.

## Repo

```
contracts/   Foundry: LienRegistry, RevenueSplitter, LenderPool, MockUSYCTeller (+ tests)
agent/       TypeScript: x402 facilitator, Horos Lien Oracle seller, agents, CLI, read API
web/         Next.js: ledger, decision feed, public lien explorer
docs/        brief + verified research notes on x402/Arc/Circle
```

## Run it

```bash
cp .env.example .env              # Circle API key + entity secret, Anthropic key, deployer + facilitator keys
cd contracts && forge test        # 7 tests: full loop, double financing, freeze, escalation, limits, default, USYC
cd ../agent && pnpm i
pnpm api                          # facilitator + seller + read API on :4021
pnpm buy 10                       # paid x402 calls from Circle buyer wallets
pnpm horos underwrite <seller> <endpoint>
pnpm horos accept <offerId> && pnpm horos fund <offerId>
pnpm horos loop                   # monitoring + treasury agents
cd ../web && pnpm i && NEXT_PUBLIC_HOROS_API=http://localhost:4021 pnpm dev
```

## Honest limitations

- Testnet only; advances are sized in single-digit USDC because they are sized from real revenue.
- Revenue history is hours to days old (the hackathon is three weeks long). The agent haircuts short histories.
- USYC is mocked pending allowlisting.
- `payTo` cannot be enforced on chain; Horos detects, freezes, refuses at the facilitator and publishes. Buyer-side
  clients that check the registry before paying are the natural next step.
