# ΟΡΟΣ · Horos

**Working capital for businesses that earn through x402.** An agent advances USDC against a seller's proven
x402 revenue on Arc, repayment is swept automatically from every incoming payment, and every advance is published
as a public on-chain lien so no one can borrow twice against the same revenue.

Built for the Tameion Agents Hackathon (Canteen × Circle). Runs on **Arc testnet**, settles in **USDC**, and uses
**Circle Wallets** for every agent action and every buyer signature.

> In ancient Attica a *horos* was a boundary stone set on mortgaged land, recording the debt for any future lender
> to read. Horos does the same for on-chain revenue (Tameion prior art #04, *Horoi*).

---

## Who uses it

| Who | Where | What they do |
|---|---|---|
| **Seller** (an x402 business) | `/borrow` | Apply with their endpoint, watch the agent review their revenue, read the verdict and reasoning, pick a pool whose rules fit, point `payTo` at their splitter, get funded, watch the line repay |
| **Lender** | `/markets`, `/lend` | Compare pools, deposit USDC for shares (ERC-4626), withdraw whatever is not lent out |
| **Curator** | `/curate` | Start a pool, set its limits and risk appetite, approve advances above the auto-approve limit, mark defaults with a published reason |
| **Anyone** | `/lookup`, `/seller/…`, `/activity` | Check whether a seller's revenue is pledged, and read every decision with its reasoning |

Everyone signs in with a **passkey** (Circle Modular Wallets): one Circle smart account on Arc per person, no extension, no
seed phrase. One account can borrow, lend and curate.

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

## The pool marketplace

`PoolFactory` lets anyone open a lending pool as its curator. Pools are EIP-1167 clones of `LenderPoolV2`, an ERC-4626
vault: lenders deposit USDC for shares; fees raise the share price, defaults lower it; withdrawals are capped at free cash.
The curator holds the human powers for that pool (approve above the auto-approve limit, mark default, set limits within
the factory's protocol caps) and **cannot withdraw depositors' money**: the contract has no such function. The Horos
agents hold `AGENT_ROLE` on every pool. Each pool enforces its own **risk appetite** on chain: `advance(...)` reverts if
the agent's risk score for the seller is above the pool's `maxRiskScore`.

The factory registers every pool as a lender in the one shared `LienRegistry`, so a seller with a live lien in any pool
is refused by every other pool (`test_crossPoolSecondLienReverts`).

The underwriter decides risk and terms once, pool-agnostic; the seller then sees which pools' rules fit the offer
(and why the others don't) and picks one.

## Deployed (Arc testnet, chain 5042002)

| Contract | Address |
|---|---|
| LienRegistry | [`0xD140eED8f20B2157366B36FcC08226d64c16906F`](https://explorer.testnet.arc.io/address/0xD140eED8f20B2157366B36FcC08226d64c16906F) |
| LenderPool (v1, operator pilot, closed) | [`0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506`](https://explorer.testnet.arc.io/address/0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506) |
| PoolFactory | [`0x99Fccc04f51284b9CDe6D3f793CC3430392e039C`](https://explorer.testnet.arc.io/address/0x99Fccc04f51284b9CDe6D3f793CC3430392e039C) |
| LenderPoolV2 (implementation) | [`0xE9dfFc5d95725EA3Ac0665A7112eD413C98D1Bac`](https://explorer.testnet.arc.io/address/0xE9dfFc5d95725EA3Ac0665A7112eD413C98D1Bac) |
| Pool "Horos Core" (curator: Horos operator, risk ≤ 60) | [`0xbb0Defa2dDa7a205FF9f7F9E016097E4Dfe5067e`](https://explorer.testnet.arc.io/address/0xbb0Defa2dDa7a205FF9f7F9E016097E4Dfe5067e) |
| Pool "Steady" (second curator account, created from a fresh key to show anyone can open a pool; risk ≤ 40) | [`0x6863ac3db29b682A33312c8c94541DB1011E25aC`](https://explorer.testnet.arc.io/address/0x6863ac3db29b682A33312c8c94541DB1011E25aC) |
| MockUSYCTeller | [`0x6be95DA212b7F77C1947b436Be9C5EC35727A4D5`](https://explorer.testnet.arc.io/address/0x6be95DA212b7F77C1947b436Be9C5EC35727A4D5) |

Contracts verified on Blockscout; pools are EIP-1167 clones of the verified implementation. Agent and buyer Circle wallets are listed in `agent/src/deployments.ts`.

## Repo

```
contracts/   Foundry: LienRegistry, RevenueSplitter, LenderPoolV2 + PoolFactory, LenderPool (v1), MockUSYCTeller (+ tests)
agent/       TypeScript: x402 facilitator, Horos Lien Oracle seller, agents, CLI, product + read API
web/         Next.js: passkey wallets, pools, borrow / lend / curate, decision feed, public lien explorer
docs/        brief + verified research notes on x402/Arc/Circle
```

## Run it

```bash
cp .env.example .env              # Circle API key + entity secret, Anthropic key, deployer + facilitator keys
cd contracts && forge test        # 18 tests: v1 loop + v2 pools (shares, defaults, caps, risk gate, cross-pool liens)
cd ../agent && pnpm i
pnpm api                          # facilitator + seller + read API on :4021
pnpm buy 10                       # paid x402 calls from Circle buyer wallets
pnpm horos underwrite <seller> <endpoint>
pnpm horos accept <offerId> && pnpm horos fund <offerId>
pnpm horos pools                  # every pool with live accounting
pnpm horos loop                   # fund-pending + monitoring + treasury agents, every pool
pnpm test                         # pool matching + signed-request auth
cd ../web && pnpm i && NEXT_PUBLIC_HOROS_API=http://localhost:4021 NEXT_PUBLIC_CIRCLE_CLIENT_KEY=… pnpm dev
```

## Honest limitations

- Testnet only; advances are sized in single-digit USDC because they are sized from real revenue.
- Revenue history is hours to days old (the hackathon is three weeks long). The agent haircuts short histories.
- USYC is mocked pending allowlisting.
- `payTo` cannot be enforced on chain; Horos detects, freezes, refuses at the facilitator and publishes. Buyer-side
  clients that check the registry before paying are the natural next step.
- A seller proves control of their revenue address through their endpoint (its live 402 must pay that address to apply,
  and must name the splitter before funding), not with a signature from that wallet. Someone running their own endpoint
  could name another business's address and encumber it, though the advance goes to that address. A payout-wallet
  signature closes this once sellers can sign with their revenue wallet.
- Pool share prices count outstanding principal at par until a curator marks a default, so a lender watching a frozen
  line can exit before the write-off (up to the pool's free cash).
