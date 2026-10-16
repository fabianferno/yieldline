// Monitoring + treasury agent. Each tick it:
//   - probes every financed seller's live x402 challenge (is revenue still routed to the splitter?)
//   - measures repayment pace vs. plan from the splitter's on-chain counters
//   - asks Claude to decide: continue / adjust_sweep / freeze / unfreeze / escalate_default — and explain
//   - manages pool idle liquidity in (mock) USYC against forecast advance demand
import type { Address } from "viem";
import { allLiens, poolState, probe402, splitterStats, tx } from "./chain.js";
import { ADDR, publicClient, toUnits } from "./config.js";
import { anchorDecision } from "./decisions.js";
import { runAgent, MODEL } from "./llm.js";
import { listOffers, readState, recordDecision, writeState } from "./store.js";
import type { Offer } from "./underwriter.js";
import MockUSYCTeller from "./abi/MockUSYCTeller.js";

type MonitorDecision = {
  action: "continue" | "adjust_sweep" | "freeze" | "unfreeze" | "escalate_default";
  newSweepBps?: number;
  severity: "info" | "warn" | "critical";
  rationale: string;
};

type TreasuryDecision = { action: "hold" | "deploy_idle" | "recall_idle"; amountUsdc: number; rationale: string };

const MONITOR_SYSTEM = `You are the Horos monitoring agent. Horos has advanced USDC to x402 sellers; each repays through a
RevenueSplitter that the seller set as their x402 payTo. The splitter sweeps sweepBps of every payment to the pool until
the repay cap is reached. Sellers control payTo and can divert revenue at any time; your job is to notice and act.

Decide one action per lien and explain it in 2-5 sentences citing the facts:
- continue: everything consistent, or a shortfall that a percentage sweep naturally absorbs (slow period ≠ default).
- adjust_sweep: repayment pace is materially behind plan with revenue still flowing to the splitter; raise sweep
  (never above maxSweepBps) — or lower it if the seller is far ahead and the line is safe. Give newSweepBps.
- freeze: the live endpoint's payTo is NOT the splitter (diversion), or the endpoint stopped serving x402 while the lien
  is live. A freeze is public in the LienRegistry and makes the splitter sweep 100% of anything that still arrives.
  Diversion is always a freeze — do not wait.
- unfreeze: the line is Frozen, payTo points back at the splitter, and revenue has resumed. Note it in the record.
- escalate_default: Frozen for a long time with no revenue reaching the splitter, or term ended with large balance
  outstanding. Only a human can mark default; you recommend it.
Call submit_decision exactly once.`;

const TREASURY_SYSTEM = `You are the Horos treasury agent for the lender pool. Idle USDC can be parked in USYC (tokenized
T-bill fund; on testnet a mock with the same Teller interface, ~4.5% APR) and recalled when needed for advances.
Keep enough liquid USDC to fund the expected advance pipeline plus a safety buffer of 20% of NAV; park the rest.
Recall if liquidity is below the buffer + pipeline. Small moves (< 1 USDC) are not worth the gas: hold.
Call submit_decision once with action, amountUsdc and a 2-4 sentence rationale citing the numbers.`;

const submitMonitor = {
  name: "submit_decision",
  description: "Submit the monitoring decision for this lien.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["continue", "adjust_sweep", "freeze", "unfreeze", "escalate_default"] },
      newSweepBps: { type: "integer" },
      severity: { type: "string", enum: ["info", "warn", "critical"] },
      rationale: { type: "string" },
    },
    required: ["action", "severity", "rationale"],
  },
};

const submitTreasury = {
  name: "submit_decision",
  description: "Submit the treasury decision.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["hold", "deploy_idle", "recall_idle"] },
      amountUsdc: { type: "number" },
      rationale: { type: "string" },
    },
    required: ["action", "amountUsdc", "rationale"],
  },
};

type LienMemory = { lastPayTo?: string; lastLlmAt?: number; lastRepaid?: number; lastAction?: string };

export async function monitorTick(opts: { force?: boolean; quietMinutes?: number } = {}) {
  const offers = await listOffers();
  const memory = await readState<Record<string, LienMemory>>("monitor-memory", {});
  const pool = await poolState();
  const liens = (await allLiens()).filter((l) => l.status === "Active" || l.status === "Frozen");
  const results: unknown[] = [];

  for (const l of liens) {
    const offer = offers.find((o) => o.seller.toLowerCase() === l.seller.toLowerCase() && o.lienId === l.id);
    const endpoint = offer?.endpoint;
    const probe = endpoint ? await probe402(endpoint).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) })) : null;
    const stats = await splitterStats(l.payTo);
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, now - l.createdAt);
    const term = Math.max(1, l.termEnd - l.createdAt);
    const expectedRepaid = Math.min(1, elapsed / term) * l.repayCapUsdc;
    const livePayTo = probe && probe.ok ? (probe as any).payTo : null;
    const diverted = !!livePayTo && livePayTo !== l.payTo.toLowerCase();
    const mem = (memory[l.id] ??= {});

    const facts = {
      lienId: l.id,
      seller: l.seller,
      status: l.status,
      endpoint,
      splitter: l.payTo,
      livePayTo,
      endpointServingX402: !!(probe && probe.ok),
      diverted,
      principalUsdc: l.principalUsdc,
      repayCapUsdc: l.repayCapUsdc,
      repaidUsdc: l.repaidUsdc,
      outstandingUsdc: +(l.repayCapUsdc - l.repaidUsdc).toFixed(6),
      sweepBps: l.sweepBps,
      hoursElapsed: +(elapsed / 3600).toFixed(2),
      termHours: +(term / 3600).toFixed(1),
      expectedRepaidByNowUsdc: +expectedRepaid.toFixed(6),
      paceRatio: expectedRepaid ? +(l.repaidUsdc / expectedRepaid).toFixed(3) : null,
      splitter_totalReceivedUsdc: stats.receivedUsdc,
      splitter_forwardedToSellerUsdc: stats.forwardedUsdc,
      repaidSinceLastCheckUsdc: mem.lastRepaid === undefined ? null : +(l.repaidUsdc - mem.lastRepaid).toFixed(6),
      payToChangedSinceLastCheck: mem.lastPayTo !== undefined && mem.lastPayTo !== livePayTo,
      termEnded: now > l.termEnd,
      limits: { minSweepBps: pool.limits.minSweepBps, maxSweepBps: pool.limits.maxSweepBps },
    };

    // Only spend an LLM call when something is worth deciding about.
    const quiet = (opts.quietMinutes ?? 30) * 60_000;
    const interesting =
      opts.force ||
      diverted ||
      facts.payToChangedSinceLastCheck ||
      l.status === "Frozen" ||
      facts.termEnded ||
      (facts.paceRatio !== null && facts.hoursElapsed > 1 && (facts.paceRatio < 0.6 || facts.paceRatio > 2)) ||
      !mem.lastLlmAt ||
      Date.now() - mem.lastLlmAt > quiet;

    mem.lastPayTo = livePayTo ?? undefined;
    mem.lastRepaid = l.repaidUsdc;
    if (!interesting) {
      results.push({ lienId: l.id, skipped: true, facts });
      continue;
    }

    const { result } = await runAgent<MonitorDecision>({
      system: MONITOR_SYSTEM,
      prompt: `Lien facts:\n${JSON.stringify(facts, null, 1)}`,
      tools: [submitMonitor],
      submitTool: "submit_decision",
      maxTurns: 2,
    });
    mem.lastLlmAt = Date.now();
    mem.lastAction = result.action;

    const rec = await recordDecision({
      agent: "monitor",
      subject: l.seller,
      action: result.action,
      escalated: result.action === "escalate_default",
      inputs: { endpoint, model: MODEL, facts },
      output: { ...result, facts: { lienId: l.id, livePayTo, splitter: l.payTo, paceRatio: facts.paceRatio } },
      rationale: result.rationale,
    });

    let actionTx: string | undefined;
    if (result.action === "freeze" && l.status === "Active") actionTx = (await tx.freeze(l.id, rec.hash)).txHash;
    if (result.action === "unfreeze" && l.status === "Frozen") actionTx = (await tx.unfreeze(l.id, rec.hash)).txHash;
    if (result.action === "adjust_sweep" && result.newSweepBps) {
      const bps = Math.min(Math.max(result.newSweepBps, pool.limits.minSweepBps), pool.limits.maxSweepBps);
      if (bps !== l.sweepBps) actionTx = (await tx.setSweep(l.id, bps, rec.hash)).txHash;
    }
    const anchorTx = await anchorDecision(rec, "monitor"); // every reasoned decision is published on chain
    results.push({ lienId: l.id, decision: result, actionTx, anchorTx });
  }

  await writeState("monitor-memory", memory);
  return results;
}

export async function treasuryTick(opts: { force?: boolean } = {}) {
  const pool = await poolState();
  const offers = await listOffers();
  const pipelineUsdc = offers.filter((o) => o.status === "offered" || o.status === "accepted" || o.status === "pending_human")
    .reduce((s, o) => s + o.advanceUsdc, 0);
  const shares = (await publicClient.readContract({
    address: ADDR.teller,
    abi: MockUSYCTeller,
    functionName: "balanceOf",
    args: [ADDR.pool],
  })) as bigint;
  const price = (await publicClient.readContract({ address: ADDR.teller, abi: MockUSYCTeller, functionName: "price" })) as bigint;
  const buffer = pool.navUsdc * 0.2;
  const target = buffer + pipelineUsdc + pool.limits.maxAdvanceUsdc; // keep room for one max-size advance
  const gap = pool.liquidityUsdc - target;
  if (!opts.force && Math.abs(gap) < 1) return { skipped: true, gap };

  const facts = {
    liquidityUsdc: pool.liquidityUsdc,
    navUsdc: pool.navUsdc,
    idleInUsycUsdc: pool.idleInUsycUsdc,
    usycShares: Number(shares) / 1e6,
    usycPrice: Number(price) / 1e6,
    outstandingPrincipalUsdc: pool.outstandingPrincipalUsdc,
    pipelineUsdc,
    maxSingleAdvanceUsdc: pool.limits.maxAdvanceUsdc,
    bufferUsdc: +buffer.toFixed(6),
    targetLiquidUsdc: +target.toFixed(6),
    excessOrShortfallUsdc: +gap.toFixed(6),
  };
  const { result } = await runAgent<TreasuryDecision>({
    system: TREASURY_SYSTEM,
    prompt: `Pool facts:\n${JSON.stringify(facts, null, 1)}`,
    tools: [submitTreasury],
    submitTool: "submit_decision",
    maxTurns: 2,
  });
  const rec = await recordDecision({
    agent: "treasury",
    subject: ADDR.pool,
    action: result.action,
    escalated: false,
    inputs: { model: MODEL, facts },
    output: { ...result, facts },
    rationale: result.rationale,
  });
  let actionTx: string | undefined;
  if (result.action === "deploy_idle" && result.amountUsdc > 0) {
    const amt = Math.min(result.amountUsdc, pool.liquidityUsdc);
    actionTx = (await tx.deployIdle(toUnits(amt), rec.hash)).txHash;
  }
  if (result.action === "recall_idle" && result.amountUsdc > 0 && shares > 0n) {
    const want = (toUnits(result.amountUsdc) * 1_000_000n) / price;
    actionTx = (await tx.recallIdle(want > shares ? shares : want, rec.hash)).txHash;
  }
  const anchorTx = await anchorDecision(rec, "monitor");
  return { decision: result, facts, actionTx, anchorTx };
}

export async function loop(intervalSec = 30) {
  for (;;) {
    try {
      const m = await monitorTick();
      const t = await treasuryTick();
      console.log(new Date().toISOString(), JSON.stringify({ monitor: m, treasury: t }).slice(0, 2000));
    } catch (e: any) {
      console.error("tick failed", e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

export type { Address };
