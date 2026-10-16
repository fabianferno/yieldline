// Offer acceptance → payTo commitment → verified on the live endpoint → disbursement.
import type { Address } from "viem";
import LenderPool from "./abi/LenderPool.js";
import LienRegistry from "./abi/LienRegistry.js";
import { ADDR, publicClient, toUnits } from "./config.js";
import { probe402, tx } from "./chain.js";
import { isV1, splitterIn } from "./pools.js";
import { anchorDecision } from "./decisions.js";
import { getOffer, putOffer, recordDecision } from "./store.js";

export { getOffer };
import type { Offer } from "./underwriter.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


/** Step 1 (seller accepts in a chosen pool): deploy the seller's splitter in that pool so they can point payTo at it. */
export async function acceptOffer(id: string, pool: Address = ADDR.core) {
  const o = await getOffer(id);
  if (o.status !== "offered" && o.status !== "accepted") throw new Error(`offer ${id} is ${o.status}`);
  let splitter = await splitterIn(pool, o.seller);
  let splitterTx: string | undefined;
  if (!splitter) {
    splitterTx = (await tx.ensureSplitter(pool, o.seller)).txHash;
    splitter = await splitterIn(pool, o.seller);
  }
  Object.assign(o, { status: "accepted", pool, splitter, txs: { ...o.txs, ...(splitterTx ? { splitter: splitterTx } : {}) } });
  await putOffer(o);
  return o;
}

/** Step 2: verify the live x402 endpoint now asks buyers to pay the splitter, then disburse. */
export async function fundOffer(id: string, opts: { waitSec?: number } = {}) {
  const o = await getOffer(id);
  if (o.status !== "accepted" || !o.splitter) throw new Error(`offer ${id} must be accepted first`);

  let probe = await probe402(o.endpoint);
  const deadline = Date.now() + (opts.waitSec ?? 120) * 1000;
  while ((!probe.ok || probe.payTo !== o.splitter.toLowerCase()) && Date.now() < deadline) {
    await sleep(5000);
    probe = await probe402(o.endpoint);
  }
  const committed = probe.ok && probe.payTo === o.splitter.toLowerCase();

  const rec = await recordDecision({
    agent: "underwriter",
    subject: o.seller,
    action: committed ? "fund" : "hold",
    escalated: false,
    inputs: { endpoint: o.endpoint, offerId: o.id, probe },
    output: {
      advanceUsdc: o.advanceUsdc,
      sweepBps: o.sweepBps,
      feeBps: o.feeBps,
      termDays: o.termDays,
      facts: { livePayTo: probe.ok ? probe.payTo : null, splitter: o.splitter },
    },
    rationale: committed
      ? `Live x402 challenge at ${o.endpoint} now names splitter ${o.splitter} as payTo, so the repayment sweep is wired. Disbursing ${o.advanceUsdc} USDC on the terms in offer ${o.id}.`
      : `Holding disbursement: the live x402 challenge at ${o.endpoint} still names ${probe.ok ? probe.payTo : "no payTo"} instead of splitter ${o.splitter}. Funds move only after the commitment is visible on the endpoint buyers actually hit.`,
  });
  if (!committed) {
    await anchorDecision(rec, "underwriter", o.pool ?? ADDR.pool);
    return { offer: o, funded: false, probe };
  }

  const pool = o.pool ?? ADDR.pool;
  const r = isV1(pool)
    ? await tx.advanceV1(o.seller, toUnits(o.advanceUsdc), o.feeBps, o.sweepBps, o.termDays * 86400, o.decisionHash)
    : await tx.advance(pool, o.seller, toUnits(o.advanceUsdc), o.feeBps, o.sweepBps, o.termDays * 86400, o.riskScore, o.decisionHash);
  await anchorDecision(rec, "underwriter", pool);
  const lienId = Number(
    await publicClient.readContract({ address: ADDR.registry, abi: LienRegistry, functionName: "liveLienOfSeller", args: [o.seller] }),
  );
  if (!lienId) {
    // Above the pool's auto-approve limit: the contract queued it for the human admin.
    const pid = Number(await publicClient.readContract({ address: pool, abi: LenderPool, functionName: "proposalCount" })) - 1;
    Object.assign(o, { status: "pending_human", proposalId: pid, txs: { ...o.txs, proposal: r.txHash } });
    await putOffer(o);
    return { offer: o, funded: false, queuedForHuman: pid, txHash: r.txHash };
  }
  Object.assign(o, { status: "funded", lienId, txs: { ...o.txs, advance: r.txHash } });
  await putOffer(o);
  return { offer: o, funded: true, probe, txHash: r.txHash };
}

/** Human sign-off. For an escalated underwriting decision: release it as an offer. For a queued on-chain
 *  proposal: execute it with the admin key (LenderPool.approveProposal). */
export async function humanApprove(id: string, note = "approved by operator") {
  const o = (await getOffer(id)) as Offer & { proposalId?: number };
  if (o.status === "pending_human" && o.proposalId === undefined) {
    o.status = "offered";
    await putOffer(o);
    await recordDecision({ agent: "underwriter", subject: o.seller, action: "human_approved", escalated: true, inputs: { offerId: o.id }, output: { note }, rationale: note });
    return { offer: o };
  }
  if (o.status === "pending_human" && o.proposalId !== undefined) {
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { arcTestnet } = await import("viem/chains");
    const admin = createWalletClient({
      account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`),
      chain: arcTestnet,
      transport: http(),
    });
    const hash = await admin.writeContract({ address: o.pool ?? ADDR.pool, abi: LenderPool, functionName: "approveProposal", args: [BigInt(o.proposalId)] });
    await publicClient.waitForTransactionReceipt({ hash });
    const lienId = Number(
      await publicClient.readContract({ address: ADDR.registry, abi: LienRegistry, functionName: "liveLienOfSeller", args: [o.seller] }),
    );
    Object.assign(o, { status: "funded", lienId, txs: { ...o.txs, advance: hash } });
    await putOffer(o);
    return { offer: o, txHash: hash };
  }
  throw new Error(`offer ${id} is ${o.status}; nothing to approve`);
}

/** Operator override of an agent rejection: a small, explicitly labelled pilot line. The agent's rejection stays
 *  on the public record; this adds a human decision (signed by the admin key) with the operator's reasoning. */
export async function overrideOffer(
  id: string,
  terms: { advanceUsdc: number; sweepBps: number; feeBps: number; termDays: number },
  note: string,
) {
  const o = await getOffer(id);
  if (o.status !== "rejected") throw new Error(`offer ${id} is ${o.status}; override applies to agent rejections`);
  const rec = await recordDecision({
    agent: "human",
    subject: o.seller,
    action: "override_pilot",
    escalated: true,
    inputs: { overrides: o.id, agentDecisionHash: o.decisionHash, agentRiskScore: o.riskScore, agentFlags: o.flags },
    output: { ...terms, riskScore: o.riskScore, flags: ["operator_override", "pilot_line", ...o.flags.slice(0, 4)] },
    rationale: note,
  });
  const { anchorDecision } = await import("./decisions.js");
  const anchorTx = await anchorDecision(rec);
  const pilot: Offer = {
    ...o,
    ...terms,
    decision: "offer",
    id: rec.id,
    status: "offered",
    decisionHash: rec.hash,
    createdAt: rec.at,
    rationale: note,
    conditions: [...o.conditions, "operator pilot: agent rejection on record"],
    endpoint: process.env.ENDPOINT ?? o.endpoint,
  };
  await putOffer(pilot);
  return { pilot, anchorTx };
}
