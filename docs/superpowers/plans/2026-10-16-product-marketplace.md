# Horos Product (self-serve sellers, pool marketplace, passkey wallets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Horos from a CLI-driven demo into a two-sided product: any x402 seller can apply and get funded, anyone
can lend into or curate a pool, all through passkey wallets, all against one shared public lien registry.

**Architecture:** New `LenderPoolV2` (ERC-4626, initializer-based) deployed as EIP-1167 clones by `PoolFactory`; the
existing `LienRegistry` stays the single public record (factory gets its admin role to grant `LENDER_ROLE`). The agent
API gains a storage adapter (Upstash Redis on Vercel, files locally), signed-request auth, pool matching and seller
lifecycle routes. The Next.js app gains a Circle Modular Wallets passkey layer and new pages: markets, pool, borrow,
lend, curate, activity.

**Tech Stack:** Foundry + OpenZeppelin 5 (Clones, Initializable, ERC4626, AccessControl), TypeScript + Express 5 +
viem 2 + Anthropic SDK (Haiku), `@upstash/redis`, Next 15 + React 19 + `@circle-fin/modular-wallets-core`.

**Spec:** `docs/superpowers/specs/2026-10-16-product-marketplace-design.md`

## Global Constraints

- Arc testnet, chainId 5042002, USDC `0x3600000000000000000000000000000000000000` (6 decimals), gas paid in USDC.
- Existing `LienRegistry` `0xD140eED8f20B2157366B36FcC08226d64c16906F` is reused, never redeployed.
- Pool v1 `0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506` stays readable, labelled "Operator pilot · closed to deposits".
- Protocol caps: max advance 10 USDC, auto-approve ≤ 5 USDC, exposure ≤ 4000 bps, sweep 500–5000 bps, fee ≤ 1500 bps,
  term ≤ 14 days, risk score ≤ 100.
- Agent wallets that need `AGENT_ROLE` on every new pool: underwriter `0x222e79b48fe1a02cf6dc97c32d2f4899bbcf29e7`,
  monitor `0x2e7adb46535ec350bdbd5878401094ba6673c2cc`, admin/keeper `0xB4f4211A98F3A5eEc1f0a47ee2Fa00a9f0A65Cb0`.
- Anthropic model: Haiku only (`ANTHROPIC_MODEL`, default `claude-haiku-5-5`).
- Honest labels: override pilot, mock USYC, testnet caps. No invented TVL, APR or testimonials.
- Design system: `web/DESIGN.md` (single red accent on graphite, `panel`, `btn`, `mono`, existing `ui.tsx` components).
- Commits authored by the configured git user, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Redeeming more than free cash**: a lender whose money is lent out expects a clear "available now: $X" and a
   capped redeem, never a revert with hex. → Task 1 test `test_redeemCappedAtFreeCash`, Task 9 UI caps input at `maxWithdraw`.
2. **Same seller applying twice / to a second pool while encumbered**: expect a clear refusal naming the live lien.
   → Task 1 `test_crossPoolSecondLienReverts`, Task 4 `match` test "encumbered seller → no eligible pool".
3. **Replayed or expired signed request**: expect 401, nothing changes. → Task 5 auth tests.
4. **Endpoint that does not return a 402** at apply time: expect an immediate, readable error before any Haiku spend.
   → Task 6 route check + test.
5. **Passkey account with 0 USDC** trying to deposit: expect "you have $0 USDC on Arc" with a faucet link, not a failed
   user operation. → Task 9 deposit panel guard.

---

## File structure

```
contracts/src/LenderPoolV2.sol          ERC-4626 pool, clone-initialised, curator = admin
contracts/src/PoolFactory.sol           protocol caps, clones pools, grants LENDER_ROLE
contracts/test/HorosV2.t.sol            10 tests (spec §2)
contracts/script/DeployV2.s.sol         impl + factory + "Horos Core"
agent/src/abi/LenderPoolV2.ts, PoolFactory.ts   generated ABIs
agent/src/kv.ts                          storage adapter (Redis | files)
agent/src/store.ts                       async offers / decisions / nonces on top of kv
agent/src/pools.ts                       enumerate pools, read pool state (v1 + v2)
agent/src/match.ts                       pure eligibility function
agent/src/auth.ts                        signed-request verification
agent/src/productApi.ts                  new routes (applications, offers, pools, accounts, human decisions, tick)
agent/src/{chain,lifecycle,underwriter,monitor,decisions,cli}.ts   made pool-aware + async store
agent/test/match.test.ts, auth.test.ts   node:test via tsx
web/lib/wallet.tsx                       passkey wallet context
web/lib/contracts.ts                     ABI fragments, addresses, revert decoding
web/lib/signed.ts                        signed POST helper
web/components/{Connect,TxButton}.tsx
web/app/(app)/{markets,pools/[address],borrow,lend,curate,activity}/page.tsx
web/components/Sidebar.tsx, Tour.tsx     new IA
```

---

### Task 1: `LenderPoolV2` + `PoolFactory` with tests

**Files:**
- Create: `contracts/src/LenderPoolV2.sol`, `contracts/src/PoolFactory.sol`, `contracts/test/HorosV2.t.sol`

**Interfaces:**
- Produces (Solidity):
  - `struct Limits { uint128 maxAdvance; uint128 autoApproveLimit; uint16 maxExposureBps; uint16 minSweepBps; uint16 maxSweepBps; uint16 maxFeeBps; uint64 maxTerm; uint8 maxRiskScore; }` (in `PoolFactory.sol`)
  - `PoolFactory.createPool(string name, string symbol, Limits l) returns (address)`, `checkLimits(Limits)`, `allPools() returns (address[])`, `caps() returns (Limits fields)`, `isPool(address)`, event `PoolCreated(address indexed pool, address indexed curator, string name, string symbol)`
  - `LenderPoolV2`: ERC-4626 (`deposit`, `redeem`, `withdraw`, `maxWithdraw`, `maxRedeem`, `totalAssets`, `convertToAssets`), `curator()`, `limits()`, `setLimits(Limits)`, `advance(address seller,uint128 amount,uint16 feeBps,uint16 sweepBps,uint64 term,uint8 riskScore,bytes32 decisionHash) returns (uint256)`, `approveProposal(uint256)`, `proposals(uint256)`, `proposalCount()`, `ensureSplitter(address)`, `splitterOf(address)`, `onRepayment`, `setSweep`, `freeze`, `unfreeze`, `markDefault`, `logDecision`, `setTeller`, `deployIdle`, `recallIdle`, `liquidity()`, `nav()`, accounting getters identical to v1 (`outstandingPrincipal`, `totalAdvanced`, `totalRepaid`, `totalFeesEarned`, `totalWrittenOff`, `idleDeployed`, `teller`, `usyc`). Events identical to v1 so the activity decoder works.

- [ ] **Step 1: Write `HorosV2.t.sol`** with the 10 tests from spec §2: deposit/redeem round trip, share price up after
  fee sweep, default writes share price down, redeem capped at free cash, risk gate, factory cap rejection (create and
  setLimits), factory grants LENDER_ROLE (and a non-factory pool cannot open), cross-pool second lien reverts,
  only curator approves proposals, only curator marks defaults. Reuse the `USDC` mock from `Horos.t.sol`.
- [ ] **Step 2:** `forge test --match-contract HorosV2` → fails to compile (contracts missing).
- [ ] **Step 3: Implement `PoolFactory.sol`** (AccessControl; immutables `registry`, `implementation`; storage
  `caps`, `agents`, `pools`, `isPool`; `createPool` = `checkLimits` → `Clones.clone` → `initialize(msg.sender, agents, name, symbol, l)` → `registry.grantRole(LENDER_ROLE, pool)`; admin-only `setCaps`, `setAgents`).
- [ ] **Step 4: Implement `LenderPoolV2.sol`**: `ERC4626(usdc) ERC20("", "")`, `Initializable`, `AccessControl`;
  constructor sets immutables `usdc`, `registry` and calls `_disableInitializers()`; `initialize` stores
  `factory = msg.sender`, `curator`, `_name`, `_symbol`, `limits`, grants roles; `name()/symbol()` overridden;
  `_decimalsOffset() = 6`; `totalAssets() = balance + idleDeployed + outstandingPrincipal`; `maxWithdraw/maxRedeem`
  capped at liquid; v1 logic ported with `riskScore` gate and `limits` struct; no admin `withdraw`.
- [ ] **Step 5:** `forge test` → all 17 tests pass. `forge build --sizes` → both new contracts < 24,576 bytes.
- [ ] **Step 6: Commit** `Contracts: ERC-4626 LenderPoolV2 clones and PoolFactory with protocol caps`.

### Task 2: Deploy factory + Horos Core on Arc testnet

**Files:**
- Create: `contracts/script/DeployV2.s.sol`
- Modify: `deployments/arc-testnet.json`, `agent/src/deployments.ts` (via `scripts/gen-deployments.py`), `agent/src/abi/LenderPoolV2.ts`, `agent/src/abi/PoolFactory.ts`

**Interfaces:**
- Produces: `deployments.poolFactory`, `deployments.poolImplementation`, `deployments.corePool` addresses.

- [ ] **Step 1:** Script deploys `LenderPoolV2(USDC, registry)` impl, `PoolFactory(registry, impl, admin, agents, caps)`,
  then `registry.grantRole(DEFAULT_ADMIN_ROLE, factory)`, then `factory.createPool("Horos Core", "hCORE", {10e6, 5e6, 4000, 500, 5000, 1500, 14 days, 60})` and `core.setTeller(mockTeller, mockTeller)`.
- [ ] **Step 2:** `forge script script/DeployV2.s.sol --rpc-url arc_testnet --broadcast --skip-simulation` (forge simulation cannot run Arc's USDC precompile). Verify on Blockscout.
- [ ] **Step 3:** Seed Core: `cast send USDC approve(core, 5e6)` then `cast send core deposit(5e6, admin)` from the deployer.
- [ ] **Step 4:** Add addresses to `deployments/arc-testnet.json`, run `python3 agent/scripts/gen-deployments.py`, generate ABIs:
  `jq -c .abi out/LenderPoolV2.sol/LenderPoolV2.json` → `export default <abi> as const;`.
- [ ] **Step 5:** `cast call core "totalAssets()"` = 5000000. Commit `Deploy PoolFactory and Horos Core pool`.

### Task 3: Storage adapter (Redis | files), async store

**Files:**
- Create: `agent/src/kv.ts`
- Modify: `agent/src/store.ts` and every caller (`lifecycle.ts`, `underwriter.ts`, `monitor.ts`, `decisions.ts`, `cli.ts`, `seller.ts`)

**Interfaces:**
- Produces:
  - `kv.get<T>(key): Promise<T|null>`, `kv.set(key, v, {exSec?, nx?}): Promise<boolean>`, `kv.hget<T>(h, f)`, `kv.hset(h, f, v)`, `kv.hvals<T>(h): Promise<T[]>`, `kv.incr(key, exSec): Promise<number>`
  - store: `putOffer(o)`, `getOffer(idOrHash)`, `listOffers()`, `recordDecision(d): Promise<Decision>`, `patchDecision(hash, patch)`, `listDecisions()`, `readState/writeState` (async), `recordEvent` (unchanged, file only).
- Redis when `KV_REST_API_URL`+`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`_TOKEN`) are set; otherwise files under `agent/data` (existing `offers.json` array is migrated to a map on first read).

- [ ] Steps: write `kv.ts`; convert store to async; `pnpm typecheck` clean; `pnpm horos offers` still lists existing offers; commit `Agent: storage adapter (Upstash Redis on Vercel, files locally)`.

### Task 4: Pool-aware chain layer + pure matching

**Files:**
- Create: `agent/src/pools.ts`, `agent/src/match.ts`, `agent/test/match.test.ts`
- Modify: `agent/src/chain.ts` (all `tx.*` take `pool: Address` first; `advanceV2` adds `riskScore`), `agent/src/decisions.ts` (activity over registry + all pools; anchor on a given pool, default Core), `agent/src/monitor.ts` (lien's pool = `lien.lender`; treasury per pool with a teller), `agent/src/underwriter.ts` (tool `get_lending_capacity` replaces `get_pool_state`; clamp to protocol caps and best pool capacity; no amount-based escalation), `agent/src/lifecycle.ts` (`acceptOffer(id, pool)`, `fundOffer(id)` uses `offer.pool`).

**Interfaces:**
- Produces:
  - `type PoolInfo = { address; version: 1|2; name; symbol; curator; openToDeposits: boolean; limits: { maxAdvanceUsdc; autoApproveLimitUsdc; maxExposureBps; minSweepBps; maxSweepBps; maxFeeBps; maxTermDays; maxRiskScore }; totalAssetsUsdc; liquidityUsdc; outstandingPrincipalUsdc; totalAdvancedUsdc; totalRepaidUsdc; feesEarnedUsdc; writtenOffUsdc; idleInUsycUsdc; sharePrice: number|null; teller: Address|null }`
  - `listPools(): Promise<Address[]>` (v1 + factory), `readPool(addr): Promise<PoolInfo>`, `allPoolInfo(): Promise<PoolInfo[]>`
  - `match(offer: {advanceUsdc, sweepBps, feeBps, termDays, riskScore}, pools: PoolInfo[], encumbered: boolean): { pool: Address; name: string; eligible: boolean; reasons: string[]; needsCuratorApproval: boolean }[]`
- [ ] Test cases (`node --import tsx --test agent/test/match.test.ts`): eligible pool; risk above appetite; not enough free cash; exposure; v1 pool always ineligible ("closed to new advances"); encumbered seller → every pool ineligible with "already has a live lien"; `needsCuratorApproval` above auto-approve.
- [ ] `pnpm typecheck`; commit `Agent: pool-aware chain layer, matching, monitor and treasury across pools`.

### Task 5: Signed-request auth

**Files:**
- Create: `agent/src/auth.ts`, `agent/test/auth.test.ts`

**Interfaces:**
- Message format (built by web `lib/signed.ts`, parsed here):
  ```
  Horos request
  action: <action>
  subject: <subject>
  account: <0x address>
  nonce: <hex>
  expires: <ISO 8601>
  ```
- Produces: `buildMessage(f)`, `parseMessage(m)`, `verifyRequest({message, signature}, action, subject?, verify = viemVerify): Promise<Address>` throwing `AuthError(status, msg)`. Nonce stored with `kv.set("nonce:"+n, 1, {nx:true, exSec:900})`.
- [ ] Tests with a local private-key account: valid → address; wrong action → 401; expired → 401; replay → 401; bad signature → 401.
- [ ] Commit `Agent: signed request verification (ERC-1271/6492 via viem)`.

### Task 6: Product API routes

**Files:**
- Create: `agent/src/productApi.ts`
- Modify: `agent/src/server.ts` (mount at `/api`), `agent/src/underwriter.ts` (`underwrite(seller, endpoint, {offerId, applicant, onStep})`), `agent/src/llm.ts` (`onStep` callback)

**Routes:** exactly spec §3. Apply: verify signature (`action: apply`, `subject: endpoint`), rate limit `kv.incr("rl:"+account, 3600) > 3 → 429`, `probe402(endpoint)` must be `ok` else 400 with what came back, create offer `{status:"underwriting", applicant, seller: payout, endpoint, trace: []}`, run underwriter in `waitUntil` (Vercel) or un-awaited promise (local). `GET /api/cron/tick` requires `Authorization: Bearer $CRON_SECRET` when set.
- [ ] Local smoke: `pnpm api`, `curl /api/pools`, `curl /api/accounts/<admin>`; apply via a script signing with a local key against the Horos Lien Oracle endpoint → offer reaches `offered|rejected` with trace.
- [ ] Commit `Agent: self-serve seller lifecycle, pools and accounts API`.

### Task 7: Passkey wallet layer + Connect

**Files:**
- Create: `web/lib/wallet.tsx`, `web/lib/contracts.ts`, `web/lib/signed.ts`, `web/components/Connect.tsx`, `web/components/TxButton.tsx`
- Modify: `web/package.json` (+ `@circle-fin/modular-wallets-core`, `viem`), `web/app/(app)/layout.tsx` (wrap in `WalletProvider`)

**Interfaces:**
- `useWallet(): { status: "idle"|"connecting"|"ready"|"error"; address?: Address; usdc?: number; connect(mode: "register"|"login", username?): Promise<void>; disconnect(); send(calls: {to, data}[]): Promise<{userOpHash, txHash}>; signMessage(m: string): Promise<Hex>; refresh() }`
- `signedPost<T>(path, action, subject, body): Promise<T>` (uses `useWallet().signMessage` passed in).
- `TxButton({ label, calls: () => Promise<Call[]>, onDone })`: idle → signing → submitted → confirmed (explorer link) → error (decoded revert via `decodeRevert`).
- Env: `NEXT_PUBLIC_CIRCLE_CLIENT_KEY`, `NEXT_PUBLIC_CIRCLE_CLIENT_URL` (default `https://modular-sdk.circle.com/v1/rpc/w3s/buidl`). Without a key the Connect button shows "Wallet not configured" (no crash).
- [ ] Verify in the browser: register passkey on localhost → address shown → `signMessage` verifies against `/api` auth (Task 5) → `send` of a 0-value USDC approve confirms.
- [ ] Commit `Web: Circle Modular Wallets passkey layer`.

### Task 8: Markets, pool, activity pages + new shell

**Files:**
- Create: `web/app/(app)/markets/page.tsx`, `web/app/(app)/pools/[address]/page.tsx`, `web/app/(app)/activity/page.tsx`
- Modify: `web/components/Sidebar.tsx` (Explore: Markets, Activity, Check a seller; You: Borrow, Lend, Curate when connected; Connect in header; hardcoded sellers removed), `web/app/(app)/dashboard/page.tsx` → redirect to `/markets`, `web/app/(site)/page.tsx` CTAs, `web/components/ui.tsx` (`LienCard` shows holding pool name).
- [ ] `next build` passes; markets lists Pool v1 (closed) + Horos Core with live numbers.
- [ ] Commit `Web: pool marketplace, pool detail, activity feed, new navigation`.

### Task 9: Lend (deposit / redeem, positions)

**Files:** Create `web/app/(app)/lend/page.tsx`, `web/components/DepositPanel.tsx` (used on pool page too).
- Deposit: `[approve(pool, amt), deposit(amt, me)]` in one user op; guard `usdc === 0` → faucet link. Redeem: input capped at `maxWithdraw` from `/api/accounts/:me`, calls `withdraw(assets, me, me)`; note "$X is lent out; it returns as sweeps arrive".
- [ ] Browser: deposit 1 USDC into Core, position appears, redeem 0.5. Commit `Web: lender deposits and redemptions`.

### Task 10: Borrow flow

**Files:** Create `web/app/(app)/borrow/page.tsx`, `web/components/borrow/*` (Apply, Underwriting, ChoosePool, WireSplitter, LineView).
- Steps exactly spec §1 seller flow, driven by `/api/accounts/:me` offers + `/api/applications/:id` polling (2 s) + `/api/offers/:id/pools`; WireSplitter polls `POST /api/offers/:id/fund` every 6 s (signed once per attempt) and shows the `@x402/express` snippet with `payTo: "<splitter>"`.
- [ ] Browser: Horos Lien Oracle applies, picks Core, `pnpm horos divert <splitter>` locally to wire, funded. Commit `Web: self-serve borrowing flow`.

### Task 11: Curate

**Files:** Create `web/app/(app)/curate/page.tsx`, `web/components/curate/*`.
- Create pool form (fields with caps beside them, `createPool`), pools I run (`curator == me`): pending proposals → `approveProposal`; live liens → Mark default with reason (hash on chain, text via `POST /api/decisions/human`); edit limits → `setLimits`.
- [ ] Browser: second passkey creates "Steady" (appetite 40). Commit `Web: curator console`.

### Task 12: Docs, tour, deploy, end-to-end

- Update `README.md`, `web/PRODUCT.md`, `docs/DEMO.md`, `Tour.tsx` steps; add env to Vercel (`KV_*`, `CRON_SECRET`, `NEXT_PUBLIC_CIRCLE_*`); deploy both projects; run the spec §4 end-to-end on production; commit `Docs and tour for the product release`.
