// Offer acceptance → payTo commitment → verified on the live endpoint → disbursement.
import type { Address } from "viem";
import LenderPool from "./abi/LenderPool.js";
import LienRegistry from "./abi/LienRegistry.js";
import { ADDR, publicClient, toUnits } from "./config.js";
import { probe402, tx } from "./chain.js";
import { anchorDecision } from "./decisions.js";
import { readState, recordDecision, writeState } from "./store.js";
import type { Offer } from "./underwriter.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getOffer(id: string) {
  const offers = readState<Offer[]>("offers", []);
  const o = offers.find((x) => x.id === id || x.decisionHash === id);
  if (!o) throw new Error(`offer ${id} not found`);
  return o;
}

function saveOffer(o: Offer) {
  const offers = readState<Offer[]>("offers", []).map((x) => (x.id === o.id ? o : x));
  writeState("offers", offers);
}

/** Step 1 (seller accepts): deploy the seller's splitter so they can point payTo at it. */
export async function acceptOffer(id: string) {
  const o = getOffer(id);
  if (o.status !== "offered") throw new Error(`offer ${id} is ${o.status}`);
  const r = await tx.ensureSplitter(o.seller);
  const splitter = (await publicClient.readContract({
    address: ADDR.pool,
    abi: LenderPool,
    functionName: "splitterOf",
    args: [o.seller],
  })) as Address;
  Object.assign(o, { status: "accepted", splitter, txs: { ...o.txs, splitter: r.txHash } });
  saveOffer(o);
  return o;
}

/** Step 2: verify the live x402 endpoint now asks buyers to pay the splitter, then disburse. */
export async function fundOffer(id: string, opts: { waitSec?: number } = {}) {
  const o = getOffer(id);
  if (o.status !== "accepted" || !o.splitter) throw new Error(`offer ${id} must be accepted first`);

  let probe = await probe402(o.endpoint);
  const deadline = Date.now() + (opts.waitSec ?? 120) * 1000;
  while ((!probe.ok || probe.payTo !== o.splitter.toLowerCase()) && Date.now() < deadline) {
    await sleep(5000);
    probe = await probe402(o.endpoint);
  }
  const committed = probe.ok && probe.payTo === o.splitter.toLowerCase();

  const rec = recordDecision({
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
    await anchorDecision(rec, "underwriter");
    return { offer: o, funded: false, probe };
  }

  const r = await tx.advance(o.seller, toUnits(o.advanceUsdc), o.feeBps, o.sweepBps, o.termDays * 86400, o.decisionHash);
  await anchorDecision(rec, "underwriter");
  const lienId = Number(
    await publicClient.readContract({ address: ADDR.registry, abi: LienRegistry, functionName: "liveLienOfSeller", args: [o.seller] }),
  );
  Object.assign(o, { status: "funded", lienId, txs: { ...o.txs, advance: r.txHash } });
  saveOffer(o);
  return { offer: o, funded: true, probe, txHash: r.txHash };
}
