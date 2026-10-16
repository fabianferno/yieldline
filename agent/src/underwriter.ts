// Underwriting agent: investigates a seller's x402 revenue and proposes (or refuses) an advance.
import type { Address } from "viem";
import { lienInfo, poolState, probe402 } from "./chain.js";
import { runAgent, MODEL, type Tool } from "./llm.js";
import { revenueProfile } from "./revenue.js";
import { putOffer, recordDecision, type Decision } from "./store.js";
import { anchorDecision } from "./decisions.js";

export type UnderwritingDecision = {
  decision: "offer" | "reject" | "escalate";
  advanceUsdc: number;
  sweepBps: number;
  feeBps: number;
  termDays: number;
  riskScore: number; // 0 (safe) .. 100 (reject)
  revenueQuality: "clean" | "mixed" | "suspect";
  flags: string[];
  rationale: string;
  conditions: string[];
};

export type Offer = UnderwritingDecision & {
  id: string;
  seller: Address;
  endpoint: string;
  status: "offered" | "accepted" | "funded" | "rejected" | "pending_human";
  decisionHash: string;
  createdAt: string;
  splitter?: Address;
  lienId?: number;
  txs?: Record<string, string>;
};

const SYSTEM = `You are the Horos underwriting agent. Horos advances USDC working capital to businesses that earn
through x402 (pay-per-call APIs) on Arc, against their proven on-chain revenue. Repayment is a percentage sweep of
future x402 revenue routed through a per-seller RevenueSplitter set as the seller's x402 payTo, until a fixed repay
cap (principal + flat fee) is reached. Every advance becomes a public lien in the LienRegistry.

Your job: decide whether to advance, how much, and on what terms, and explain why in plain language a seller and
a credit committee can both read. You are a careful lender, not a rubber stamp.

How to underwrite:
1. Always pull the revenue profile, lien registry record, pool state, and probe the seller's live 402 endpoint.
2. Judge whether revenue is REAL. Wash-trading signs: few distinct payers, high concentration (HHI > 0.5),
   payers funded by the seller, several payers sharing one funder, brand-new payer wallets with no other activity,
   machine-regular inter-arrival times (interArrivalCv near 0 with many calls), round-trip flows. Payers funded by the
   lender's own operator wallet are related-party traffic: do not count them as arm's-length revenue.
3. Size from CLEAN revenue only. Baseline: advance ≈ 7 days of projected clean revenue (use daily run-rate; if
   history is under 3 days, annualise from the hourly series but haircut at least 50% for short history).
   Then adjust for trend (last24h vs prev24h), volatility (dailyCv), concentration, and repayment record.
4. Sweep: choose so the repay cap is expected to clear in roughly the term at the observed run-rate, within the
   pool's min/max sweep. Fee: 300–1500 bps flat, higher for riskier / shorter-history sellers; discount for prior
   clean repayments. Term ≤ pool max term.
5. Hard limits are enforced by the contracts (max advance, per-seller exposure share of NAV, sweep bounds, existing
   lien). Never propose terms outside them. If the seller already has a live lien anywhere in the registry, reject:
   double financing.
6. Decide "escalate" if the right amount exceeds the auto-approve limit or the evidence is genuinely ambiguous —
   a human will review. "reject" if revenue is not real, not x402, or the seller is encumbered/defaulted.
7. Before an offer, payTo normally points at the seller's own wallet: that is expected, not a red flag. Pointing payTo
   at the splitter is a funding CONDITION, verified on the live endpoint before any USDC is disbursed.
   Payers funded by a public testnet faucet are normal on testnet; a shared faucet funder is not wash evidence.
8. Sellers discovered by market scan have no endpoint yet; judge the revenue on its merits and make any offer
   conditional on connecting. Gateway (Nanopayments) receipts are as real as exact receipts; unsettled ones are
   receivables already owed to the seller.
9. Advances on testnet are small. Never round up to make a deal happen; a tiny honest advance beats a fake big one.

Finish by calling submit_decision exactly once. The rationale must cite the specific numbers you relied on.`;

export async function underwrite(seller: Address, endpoint: string) {
  const profileCache: { v?: Awaited<ReturnType<typeof revenueProfile>> } = {};
  const tools: Tool[] = [
    {
      name: "get_revenue_profile",
      description:
        "On-chain x402 revenue features for the seller from Arc: receipts, run-rate, daily/hourly series, payer concentration, inter-arrival regularity, and per-payer forensics (wallet age, funder, funded-by-seller/operator).",
      input_schema: { type: "object", properties: {}, required: [] },
      run: async () => (profileCache.v ??= await revenueProfile(seller)),
    },
    {
      name: "check_lien_registry",
      description: "Public LienRegistry record for the seller: live encumbrance, past liens, repaid/defaulted/frozen counts.",
      input_schema: { type: "object", properties: {}, required: [] },
      run: () => lienInfo(seller),
    },
    {
      name: "get_pool_state",
      description: "Lender pool liquidity, NAV, outstanding exposure, and the hard on-chain limits.",
      input_schema: { type: "object", properties: {}, required: [] },
      run: () => poolState(),
    },
    {
      name: "probe_live_endpoint",
      description: "Make an unpaid request to the seller's x402 endpoint and decode the 402 challenge (payTo, price, network).",
      input_schema: { type: "object", properties: {}, required: [] },
      run: () =>
        endpoint
          ? probe402(endpoint)
          : Promise.resolve({
              ok: false,
              note: "No endpoint registered: seller was discovered from on-chain x402 receipts (market scan). Any offer is conditional on the seller connecting and pointing payTo at a Horos splitter.",
            }),
    },
    {
      name: "submit_decision",
      description: "Submit the final underwriting decision.",
      input_schema: {
        type: "object",
        properties: {
          decision: { type: "string", enum: ["offer", "reject", "escalate"] },
          advanceUsdc: { type: "number", description: "USDC principal (0 if reject)" },
          sweepBps: { type: "integer" },
          feeBps: { type: "integer" },
          termDays: { type: "integer" },
          riskScore: { type: "integer", minimum: 0, maximum: 100 },
          revenueQuality: { type: "string", enum: ["clean", "mixed", "suspect"] },
          flags: { type: "array", items: { type: "string" } },
          rationale: { type: "string", description: "4-8 sentences citing the numbers relied on" },
          conditions: { type: "array", items: { type: "string" }, description: "e.g. payTo must point at splitter before funding" },
        },
        required: ["decision", "advanceUsdc", "sweepBps", "feeBps", "termDays", "riskScore", "revenueQuality", "flags", "rationale", "conditions"],
      },
    },
  ];

  const { result, trace } = await runAgent<UnderwritingDecision>({
    system: SYSTEM,
    prompt: `Underwrite seller ${seller}. Their x402 endpoint: ${endpoint || "none registered (found by market scan of Arc x402 receipts)"}. Investigate, then submit your decision.`,
    tools,
    submitTool: "submit_decision",
  });

  // Defence in depth: clamp to on-chain limits so a bad proposal fails here rather than on chain.
  const pool = await poolState();
  const d = { ...result };
  const notes: string[] = [];
  if (d.decision === "offer") {
    const maxByExposure = (pool.navUsdc * pool.limits.maxExposureBps) / 10_000;
    const cap = Math.min(pool.limits.maxAdvanceUsdc, maxByExposure, pool.liquidityUsdc);
    if (d.advanceUsdc > cap) notes.push(`clamped advance ${d.advanceUsdc} -> ${cap} (on-chain limits)`), (d.advanceUsdc = cap);
    d.sweepBps = Math.min(Math.max(d.sweepBps, pool.limits.minSweepBps), pool.limits.maxSweepBps);
    d.feeBps = Math.min(d.feeBps, pool.limits.maxFeeBps);
    d.termDays = Math.min(Math.max(1, d.termDays), pool.limits.maxTermDays);
    d.advanceUsdc = Math.floor(d.advanceUsdc * 1e6) / 1e6;
    if (d.advanceUsdc <= 0) notes.push("advance rounds to zero"), (d.decision = "reject");
    if (d.advanceUsdc > pool.limits.autoApproveLimitUsdc) notes.push("above auto-approve limit"), (d.decision = "escalate");
  }

  const rec: Decision = await recordDecision({
    agent: "underwriter",
    subject: seller,
    action: d.decision,
    escalated: d.decision === "escalate",
    inputs: { endpoint, model: MODEL, investigation: trace },
    output: { ...d, guardrailNotes: notes },
    rationale: d.rationale,
  });

  const offer: Offer = {
    ...d,
    id: rec.id,
    seller,
    endpoint,
    status: d.decision === "offer" ? "offered" : d.decision === "escalate" ? "pending_human" : "rejected",
    decisionHash: rec.hash,
    createdAt: rec.at,
  };
  await putOffer(offer);
  const anchorTx = await anchorDecision(rec, "underwriter");
  return { offer, decision: rec, guardrailNotes: notes, anchorTx };
}
