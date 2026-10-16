// Product API: self-serve sellers (apply → offer → choose pool → wire payTo → funded), the pool marketplace,
// accounts, curator decisions, and the agent tick. Mutations are signed by the caller's passkey account (auth.ts).
import { randomBytes } from "node:crypto";
import express, { Router, type Request, type Response } from "express";
import { getAddress, isAddress, keccak256, toHex, type Address } from "viem";
import { allLiens, lienInfo, probe402, splitterStats } from "./chain.js";
import { activity } from "./decisions.js";
import { AuthError, verifyRequest } from "./auth.js";
import { kv } from "./kv.js";
import { acceptOffer, fundOffer } from "./lifecycle.js";
import { match } from "./match.js";
import { fundPending, monitorTick, treasuryTick } from "./monitor.js";
import { allPoolInfo, isV1, pendingProposals, position, protocolCaps, readPool } from "./pools.js";
import { getDecision, getOffer, listOffers, putOffer, recordDecision } from "./store.js";
import { underwrite, type Offer } from "./underwriter.js";
import type { TraceStep } from "./llm.js";

export const productApi = Router();
productApi.use(express.json());

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const wrap = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    res.json(await fn(req));
  } catch (e: any) {
    const status = e instanceof AuthError || e instanceof HttpError ? e.status : 500;
    res.status(status).json({ error: e?.message ?? String(e), ...(e instanceof HttpError ? e.extra : {}) });
  }
};

const memo = new Map<string, { at: number; v: unknown }>();
const cached = async <T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
};

/** Keep work running after the response: Vercel's waitUntil when deployed, a detached promise locally. */
async function background(p: Promise<unknown>) {
  if (process.env.VERCEL) {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(p);
  } else p.catch((e) => console.error("background task failed", e));
}

const STEP_LABEL: Record<string, string> = {
  get_revenue_profile: "Read the seller's x402 receipts and payer history on Arc",
  check_lien_registry: "Checked the public lien registry for existing claims",
  get_lending_capacity: "Checked what the open pools can lend",
  probe_live_endpoint: "Probed the live 402 endpoint",
};

function stepSummary(s: TraceStep) {
  const o = (s.output ?? {}) as any;
  if (o.error) return `${STEP_LABEL[s.tool] ?? s.tool}: ${o.error}`;
  if (s.tool === "get_revenue_profile" && o.distinctPayers !== undefined)
    return `${STEP_LABEL[s.tool]}: ${o.historyHours}h of history, ${o.distinctPayers} payers, $${o.dailyMeanUsdc}/day`;
  if (s.tool === "check_lien_registry") return `${STEP_LABEL[s.tool]}: ${o.encumbered ? `live lien #${o.liveLienId}` : "no live lien"}`;
  if (s.tool === "probe_live_endpoint") return `${STEP_LABEL[s.tool]}: payTo ${o.payTo ?? "none"}`;
  return STEP_LABEL[s.tool] ?? s.tool;
}

const ACTIVE: Offer["status"][] = ["underwriting", "offered", "accepted", "pending_human"];
const publicOffer = (o: Offer) => o;

// ---------------------------------------------------------------- seller lifecycle

productApi.post(
  "/applications",
  wrap(async (req) => {
    const { endpoint, payout } = req.body ?? {};
    if (typeof endpoint !== "string" || !/^https?:\/\//.test(endpoint)) throw new HttpError(400, "Enter the full URL of your x402 endpoint (https://…).");
    if (typeof payout !== "string" || !isAddress(payout)) throw new HttpError(400, "Enter the address that receives your x402 revenue.");
    const applicant = await verifyRequest(req.body, "apply", endpoint);
    const seller = getAddress(payout);

    const existing = (await listOffers()).find((o) => o.seller.toLowerCase() === seller.toLowerCase() && ACTIVE.includes(o.status));
    if (existing) return { id: existing.id, existing: true };

    if ((await kv.incr(`rl:apply:${applicant}`, 3600)) > 3) throw new HttpError(429, "Three applications per hour per account. Try again later.");

    const probe = await probe402(endpoint).catch((e) => ({ ok: false as const, status: 0, error: String(e?.message ?? e) }));
    if (!probe.ok) {
      const why = probe.status ? `HTTP ${probe.status}` : probe.error;
      throw new HttpError(400, `That URL did not return an x402 payment challenge (${why}).`, { probe });
    }

    const id = `app_${randomBytes(5).toString("hex")}`;
    const placeholder: Offer = {
      id,
      seller,
      endpoint,
      applicant,
      status: "underwriting",
      decision: "escalate",
      advanceUsdc: 0,
      sweepBps: 0,
      feeBps: 0,
      termDays: 0,
      riskScore: 0,
      revenueQuality: "mixed",
      flags: [],
      rationale: "",
      conditions: [],
      decisionHash: "",
      createdAt: new Date().toISOString(),
      trace: [{ tool: "probe", at: new Date().toISOString(), summary: `Endpoint answers with an x402 challenge; payTo ${probe.payTo}` }],
    };
    await putOffer(placeholder);

    const onStep = async (s: TraceStep) => {
      const cur = await getOffer(id);
      cur.trace = [...(cur.trace ?? []), { tool: s.tool, at: new Date().toISOString(), summary: stepSummary(s) }];
      await putOffer(cur);
    };
    await background(
      underwrite(seller, endpoint, { offerId: id, applicant, onStep }).catch(async (e) => {
        const cur = await getOffer(id);
        await putOffer({ ...cur, status: "failed", error: e?.message ?? String(e) });
      }),
    );
    return { id, probe };
  }),
);

productApi.get("/applications/:id", wrap(async (req) => publicOffer(await getOffer(String(req.params.id)))));

productApi.get(
  "/offers/:id/pools",
  wrap(async (req) => {
    const o = await getOffer(String(req.params.id));
    const [pools, lien] = await Promise.all([cached("pools", 5000, allPoolInfo), lienInfo(o.seller)]);
    return { offer: o.id, encumbered: lien.encumbered, matches: match(o, pools, lien.encumbered) };
  }),
);

async function ownOffer(req: Request, action: string) {
  const id = String(req.params.id);
  const account = await verifyRequest(req.body, action, id);
  const o = await getOffer(id);
  const mine = [o.applicant, o.seller].some((a) => a && a.toLowerCase() === account.toLowerCase());
  if (!mine) throw new HttpError(403, "This offer belongs to another account.");
  return o;
}

productApi.post(
  "/offers/:id/accept",
  wrap(async (req) => {
    const o = await ownOffer(req, "accept");
    const pool = String(req.body?.pool ?? "");
    if (!isAddress(pool)) throw new HttpError(400, "Choose a pool.");
    const [pools, lien] = await Promise.all([allPoolInfo(), lienInfo(o.seller)]);
    const m = match(o, pools, lien.encumbered).find((x) => x.pool.toLowerCase() === pool.toLowerCase());
    if (!m) throw new HttpError(404, "Unknown pool.");
    if (!m.eligible) throw new HttpError(409, m.reasons[0], { reasons: m.reasons });
    return publicOffer(await acceptOffer(o.id, getAddress(pool)));
  }),
);

/** Fund check. Unsigned on purpose: it only acts on state anyone can verify (the live 402 names the splitter),
 *  so the seller's page can poll it without a passkey prompt each time. */
productApi.post(
  "/offers/:id/fund",
  wrap(async (req) => {
    const o = await getOffer(String(req.params.id));
    if (o.status === "funded" || o.status === "pending_human") return { offer: o, funded: o.status === "funded" };
    if (o.status !== "accepted" || !o.splitter) throw new HttpError(409, `Offer is ${o.status}; accept it in a pool first.`);
    const probe = await probe402(o.endpoint).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    const livePayTo = probe.ok ? probe.payTo : null;
    if (livePayTo !== o.splitter.toLowerCase()) return { offer: o, funded: false, wired: false, livePayTo };
    if (!(await kv.set(`funding:${o.id}`, 1, { nx: true, exSec: 120 }))) return { offer: o, funded: false, wired: true, busy: true };
    const r = await fundOffer(o.id, { waitSec: 0 });
    return { ...r, wired: true };
  }),
);

// ---------------------------------------------------------------- marketplace

async function liensByPool() {
  const liens = await cached("liens", 5000, allLiens);
  const by = new Map<string, typeof liens>();
  for (const l of liens) by.set(l.lender.toLowerCase(), [...(by.get(l.lender.toLowerCase()) ?? []), l]);
  return by;
}

productApi.get(
  "/pools",
  wrap(() =>
    cached("pools-view", 5000, async () => {
      const [pools, by, caps] = await Promise.all([allPoolInfo(), liensByPool(), protocolCaps()]);
      return {
        caps,
        pools: pools.map((p) => {
          const liens = by.get(p.address.toLowerCase()) ?? [];
          return { ...p, liveLiens: liens.filter((l) => l.status === "Active" || l.status === "Frozen").length, liensTotal: liens.length };
        }),
      };
    }),
  ),
);

productApi.get(
  "/pools/:address",
  wrap(async (req) => {
    const a = String(req.params.address);
    if (!isAddress(a)) throw new HttpError(400, "bad address");
    const addr = getAddress(a);
    return cached(`pool:${addr}`, 5000, async () => {
      const [pool, by, proposals] = await Promise.all([readPool(addr), liensByPool(), pendingProposals(addr)]);
      const liens = await Promise.all((by.get(addr.toLowerCase()) ?? []).map(async (l) => ({ ...l, splitter: await splitterStats(l.payTo) })));
      return { pool, liens: liens.reverse(), proposals };
    });
  }),
);

productApi.get(
  "/activity",
  wrap(async (req) => {
    const feed = await cached("activity", 10000, activity);
    const pool = typeof req.query.pool === "string" ? req.query.pool.toLowerCase() : null;
    return { feed: pool ? feed.filter((f: any) => f.pool?.toLowerCase() === pool) : feed };
  }),
);

productApi.get(
  "/accounts/:address",
  wrap(async (req) => {
    const a = String(req.params.address);
    if (!isAddress(a)) throw new HttpError(400, "bad address");
    const me = getAddress(a).toLowerCase();
    const [offers, pools] = await Promise.all([listOffers(), cached("pools", 5000, allPoolInfo)]);
    const mine = offers.filter((o) => o.applicant?.toLowerCase() === me || o.seller.toLowerCase() === me);
    const sellers = [...new Set(mine.map((o) => o.seller))];
    const v2 = pools.filter((p) => p.version === 2);
    const [liens, positions, curated] = await Promise.all([
      Promise.all(sellers.map((s) => lienInfo(s))),
      Promise.all(v2.map((p) => position(p.address, getAddress(a)))),
      Promise.all(
        pools
          .filter((p) => p.curator.toLowerCase() === me)
          .map(async (p) => ({ ...p, proposals: await pendingProposals(p.address) })),
      ),
    ]);
    return {
      offers: mine,
      liens,
      positions: positions.filter((p) => p.shares > 0).map((p) => ({ ...p, name: v2.find((x) => x.address === p.pool)?.name })),
      curated,
    };
  }),
);

productApi.get("/caps", wrap(() => cached("caps", 60000, protocolCaps)));

// ---------------------------------------------------------------- curator decisions

/** Curators sign default / approval transactions themselves; this stores the reason text behind the on-chain hash
 *  so the public record reads as words, not only a hash. */
productApi.post(
  "/decisions/human",
  wrap(async (req) => {
    const { pool, action, reason, lienId, proposalId, txHash } = req.body ?? {};
    if (typeof pool !== "string" || !isAddress(pool)) throw new HttpError(400, "pool required");
    if (!["default", "approve"].includes(action)) throw new HttpError(400, "action must be default or approve");
    if (typeof reason !== "string" || reason.trim().length < 10) throw new HttpError(400, "Write a reason of at least a sentence.");
    const account = await verifyRequest(req.body, "curate", getAddress(pool));
    const p = await readPool(getAddress(pool));
    if (p.curator.toLowerCase() !== account.toLowerCase() || isV1(p.address)) throw new HttpError(403, "Only this pool's curator can record its decisions.");
    const rec = await recordDecision({
      agent: "human",
      subject: p.address,
      pool: p.address,
      action: action === "default" ? "mark_default" : "approve_proposal",
      escalated: true,
      inputs: { lienId, proposalId, curator: account, reasonHash: keccak256(toHex(reason)) },
      output: { txHash },
      rationale: reason,
      txHash,
    });
    return { decision: rec.id, hash: rec.hash };
  }),
);

productApi.get("/decisions/:hash", wrap(async (req) => (await getDecision(String(req.params.hash))) ?? Promise.reject(new HttpError(404, "not found"))));

// ---------------------------------------------------------------- agent tick (Vercel Cron or any scheduler)

productApi.get(
  "/cron/tick",
  wrap(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, "unauthorized");
    const fund = await fundPending();
    const monitor = await monitorTick().catch((e) => ({ error: e?.message }));
    const treasury = await treasuryTick().catch((e) => ({ error: e?.message }));
    return { fund, monitor, treasury };
  }),
);

export type { Address };
