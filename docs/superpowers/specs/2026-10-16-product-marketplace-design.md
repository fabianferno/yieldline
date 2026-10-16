# Horos as a product: self-serve sellers, a lender marketplace, passkey wallets

Date: 2026-10-16 · Status: design approved in sections 1–3; section 4 written here for review · Deadline: Oct 17, 11:59 PM ET

## Why

Today Horos is a demo flow: every action runs from the CLI with operator keys, there is one admin-only pool, sellers are
hardcoded in the sidebar and the web app cannot sign anything. This spec turns it into a two-sided product: any x402 seller
can borrow, anyone can lend, anyone can run a pool, and all of it settles against one shared public lien registry.

Agreed decisions:

- Scope **A, kept lean**: all four personas self-serve before the deadline.
- Wallets: **Circle Modular Wallets** (passkey → MSCA smart account on Arc testnet, Circle bundler + paymaster).
- Lenders: **PoolFactory + ERC-4626 pools** (option 1), curated pools in a marketplace, one shared `LienRegistry`.

Product principles from `web/PRODUCT.md` still bind: proof over claims, show the reasoning, honest labels, the loop is
the product.

## 1. Personas and surfaces (approved)

One **Connect** button: passkey register / login via Circle Modular Wallets. Roles are derived from on-chain and API
state, not chosen; one account can hold several.

| Persona | Home | Can do |
|---|---|---|
| Seller (x402 business) | `/borrow` | apply → see verdict, terms, reasoning → pick an eligible pool → wire `payTo` → get funded → manage the line |
| Lender / LP | `/lend` | see positions across pools, deposit, redeem (capped at free cash) |
| Curator | `/curate` | create a pool within protocol caps; approve proposals; mark defaults with a written reason; edit limits |
| Anyone | `/markets`, `/pools/[address]`, `/lookup`, `/seller/[address]`, `/activity` | read everything without connecting |

Public:

- `/` landing, two CTAs: **Get working capital** → `/borrow`, **Earn on x402 revenue** → `/markets`.
- `/markets`: every pool: name, curator, limits, risk appetite, free cash, deployed, fees earned, written off,
  realised 30-day yield (computed from share price history, labelled "realised, not projected"), live lien count.
  Pool v1 is listed as **"Operator pilot · closed to deposits"**.
- `/pools/[address]`: limits in plain words, liens, decisions for this pool, deposit / redeem panel.
- `/lookup`, `/seller/[address]`: unchanged in purpose; now show which pool holds each lien.
- `/activity`: the cross-pool agent decision feed (moved out of today's dashboard).

Seller flow (`/borrow`):

1. **Apply**: x402 endpoint URL + payout address. The live 402 is probed on blur and the current `payTo` shown.
2. **Underwriting**: agent trace streams in; then verdict → terms → reasoning (existing `DecisionEntry` pattern).
3. **Choose a pool**: eligible pools with free cash; ineligible ones listed with the reason. No eligible pool → say so.
4. **Wire the splitter**: copy-paste `payTo` snippet for `@x402/express`, live checker that turns green when the 402
   names the splitter.
5. **Funded**: transfer + lien links. If above the pool's auto-approve limit: "waiting for curator approval".
6. **Manage**: repaid vs cap, sweep pace vs expected, freeze state and reason, lien history.

Seller identity: the passkey account is the Horos login; the **payout address** is the seller identity in the registry and
receives the advance. Ownership is proven by **endpoint control**: funds move only after the live 402 names the
splitter, which only the endpoint operator can do. Registering someone else's address gains nothing.

Connect panel: address (copy), USDC balance, Circle faucet link. Gas: Circle paymaster where sponsored, USDC otherwise.

Removed: hardcoded seller links in `Sidebar.tsx`. Featured sellers come from data on `/markets`.

## 2. Contracts (approved)

Unchanged: `LienRegistry` (already multi-lender: `LENDER_ROLE`, per-lien `lender`), `RevenueSplitter`. Pool v1
(`0x3655…7506`) keeps lien #1 and its history, shown as closed.

### `LenderPoolV2` (ERC-4626 over USDC, OpenZeppelin)

- `_decimalsOffset()` = 6 (inflation-attack defence).
- `totalAssets()` = liquid USDC + `idleDeployed` + `outstandingPrincipal` (same as v1 `nav()`).
- `maxWithdraw` / `maxRedeem` capped at liquid USDC.
- Roles: `DEFAULT_ADMIN_ROLE` = curator; `AGENT_ROLE` = Horos agent Circle wallet.
- `advance(seller, amount, feeBps, sweepBps, term, riskScore, decisionHash)`: reverts
  `LimitExceeded("riskAppetite")` if `riskScore > maxRiskScore`; otherwise v1 behaviour (auto-approve limit → proposal).
- Ported from v1: `approveProposal`, splitter creation, `onRepayment` (overshoot past cap counted as fee),
  `setSweep`, `freeze`, `unfreeze`, `markDefault` (admin only, writes down `outstandingPrincipal` → share price),
  `logDecision`, `setTeller`, `deployIdle`, `recallIdle`, `setLimits` (bounded by factory caps).
- **No admin `withdraw()`.** Curators cannot take depositor funds.
- Double financing: `_checkLimits` keeps `registry.encumbrance(seller) == 0`, so a live lien in any pool blocks every
  other pool.

### `PoolFactory`

- Protocol caps (Horos admin): max advance $10, auto-approve ≤ $5, exposure ≤ 40 %, sweep 5–50 %, term ≤ 14 d,
  fee ≤ 15 %. `createPool` and every pool's `setLimits` revert above them (pool reads caps from factory).
- `createPool(name, symbol, Limits, maxRiskScore)` → deploys pool with `admin = msg.sender`, `agent = horosAgent`,
  grants `LENDER_ROLE` on the registry. Emits `PoolCreated(pool, curator, name)`; `pools()` lists all.
- Factory holds `DEFAULT_ADMIN_ROLE` on the registry; `createPool` is its only use.

### Tests (Foundry)

1. Deposit / redeem round trip.
2. Share price rises after a fee sweep.
3. Default writes share price down by the written-off amount.
4. Redeem capped at free cash.
5. Risk-score gate reverts above `maxRiskScore`.
6. Factory rejects limits above caps (create and `setLimits`).
7. Factory grants `LENDER_ROLE`; non-factory pool cannot open liens.
8. Cross-pool second lien on the same seller reverts.
9. Only the curator can approve a proposal.
10. Only the curator can mark a default.

Deploy: factory + seeded pool **"Horos Core"** (Horos operator as curator, `maxRiskScore` 60). Update
`deployments/arc-testnet.json`, `agent/src/deployments.ts`, ABIs.

## 3. Backend (approved)

**Storage**: Upstash Redis (Vercel Marketplace). `store.ts` becomes an adapter: Redis when `REDIS_URL` is set,
files otherwise (CLI unchanged). Applications, offers, decision log and nonces move there. On-chain anchoring unchanged.

**Auth**: no sessions. Mutating requests carry a passkey-signed message
`Horos: <action> <id> · nonce <n> · expires <iso>`, verified with `publicClient.verifyMessage` (ERC-1271 / ERC-6492 for
undeployed accounts). Nonces stored in Redis to block replay.

**Routes** (added to the existing Express `readApi`):

| Route | Purpose |
|---|---|
| `POST /api/applications` | signed; `{endpoint, payout}`; probes 402, runs underwriter via `waitUntil`; 3 / account / hour |
| `GET /api/applications/:id` | status + streaming trace steps |
| `GET /api/offers/:id/pools` | eligible pools (risk ≤ appetite, within limits, free cash, exposure); ineligible with reason |
| `POST /api/offers/:id/accept {pool}` | signed; `ensureSplitter` on that pool; returns splitter + snippet |
| `POST /api/offers/:id/fund` | one probe; if `payTo` = splitter, advance (or proposal); else "not yet" |
| `GET /api/pools`, `/api/pools/:addr` | factory pools + Pool v1 |
| `GET /api/accounts/:addr` | offers, liens, LP positions, curated pools |
| `POST /api/decisions/human` | signed; stores the full reason text behind a curator's on-chain hash |
| `GET /api/cron/tick` | monitor + treasury + pending-fund checks across pools (Vercel Cron or `pnpm horos loop`) |

**Agent**: underwriter is pool-agnostic (risk + terms; pool tool reports caps and best-case capacity). Matching happens
after. `accept` / `fund` take a pool. `chain.ts` enumerates pools from the factory. Monitor and treasury iterate every
pool.

**Client-side signing (no API)**: curators' `createPool`, `approveProposal`, `markDefault`, `setLimits`; lenders'
`approve + deposit` (batched in one user operation) and `redeem`.

**Errors**: rejections and escalations show reasoning and next step; contract reverts decoded to plain text
("Pool 'Core' does not have enough free cash"); failed probes show what came back.

## 4. Frontend and verification (for review)

**Wallet layer** (`web/lib/wallet.tsx`): React context over `@circle-fin/modular-wallets-core` + viem.
`toPasskeyTransport` → `toWebAuthnCredential` (Register / Login) → `toCircleSmartAccount` → `createBundlerClient`
on `${CLIENT_URL}/arcTestnet`. Credential kept in `localStorage` for re-login. Exposes `address`, `usdcBalance`,
`send(calls[])` (one user operation, `paymaster: true`, falls back to USDC gas), `signMessage`, `disconnect`.
Env: `NEXT_PUBLIC_CIRCLE_CLIENT_KEY`, `NEXT_PUBLIC_CIRCLE_CLIENT_URL`. **Needs from the user**: a Circle Console client
key with passkey domain `horos-blue.vercel.app` and `localhost`.

**Shell**: sidebar sections become Explore (Markets, Activity, Check a seller) and You (Borrow, Lend, Curate, shown once
connected). Connect button + account chip in the sidebar header. Existing design system (`web/DESIGN.md`, `ui.tsx`
panels, single red accent on graphite) reused; the guided tour updated to the new pages.

**Transactions UI**: one `TxButton` component: idle → signing (passkey prompt) → submitted (user op hash) → confirmed
(explorer link) → error (decoded revert). Used by deposit, redeem, create pool, approve, mark default.

**Honest labels kept**: Pool v1 "operator pilot", lien #1 "override pilot", USYC "mock", testnet limits shown as caps.

**Verification**:

- `forge test` (existing 7 + 10 new).
- `pnpm typecheck` in `agent/`, `next build` in `web/`.
- Unit check of pool eligibility (pure function, a few fixtures).
- Live end-to-end on Arc testnet, recorded in `docs/DEMO.md`:
  1. Passkey A creates pool "Steady" (appetite 40).
  2. Passkey B deposits faucet USDC into Horos Core.
  3. Horos Lien Oracle applies via `/borrow`, picks Core, payTo switched, funded, sweeps visible on `/pools/[core]`.
  4. A second pool's attempt on the same seller is refused (registry encumbrance).
  5. Curator approves an above-limit proposal from the UI.

## Build order (deadline-driven)

1. Contracts + tests → deploy factory + Core (blocks everything).
2. Storage adapter + agent pool-awareness + new routes.
3. Wallet layer + Connect (needs the Circle client key; ask early).
4. `/markets`, `/pools/[address]`, `/lend` (deposit/redeem).
5. `/borrow` flow.
6. `/curate`.
7. Shell, tour, README/PRODUCT.md/DEMO.md updates, deploy both Vercel projects.

If time runs short, cut from the end: `/curate` create-pool form falls back to a documented CLI command, tour update
last.

## Out of scope

Curator performance fees, withdrawal queues, deposit caps, pool governance, per-pool repricing of agent terms,
mainnet.
