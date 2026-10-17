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
import { checkPublicUrl, UrlError } from "./net.js";
import { reconcileOffer } from "./lifecycle.js";
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

/** On the hosted API, refuse URLs that are not public http(s) endpoints (we fetch seller-supplied URLs). */
async function assertPublicUrl(url: string) {
  if (!process.env.VERCEL) return;
  try {
    await checkPublicUrl(url);
  } catch (e) {
    if (e instanceof UrlError) throw new HttpError(400, e.message);
    throw e;
  }
}

/** The seller's live lien, named for people: false when unencumbered. */
async function encumbrance(seller: Address): Promise<false | { liveLienId: number; pool: string }> {
  const info = await lienInfo(seller);
  if (!info.encumbered) return false;
  const pools = await cached("pools", 5000, allPoolInfo);
  const name = pools.find((p) => p.address.toLowerCase() === String(info.pool).toLowerCase())?.name ?? `pool ${info.pool}`;
  return { liveLienId: info.liveLienId, pool: name };
}

const ip = (req: Request) => String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();

const ACTIVE: Offer["status"][] = ["underwriting", "offered", "accepted", "pending_human"];
const publicOffer = (o: Offer) => o;

// ---------------------------------------------------------------- seller lifecycle

productApi.post(
  "/applications",
  wrap(async (req) => {
    const { endpoint, payout } = req.body ?? {};
    if (typeof endpoint !== "string" || !/^https?:\/\//.test(endpoint)) throw new HttpError(400, "Enter the full URL of your x402 endpoint (https://…).");
    if (typeof payout !== "string" || !isAddress(payout)) throw new HttpError(400, "Enter the address that receives your x402 revenue.");
    await assertPublicUrl(endpoint);
    const applicant = await verifyRequest(req.body, "apply", endpoint);
    const seller = getAddress(payout);

    const enc = await encumbrance(seller);
    if (enc) throw new HttpError(409, `This revenue address already has live lien #${enc.liveLienId} (${enc.pool}). It can borrow again once that lien closes.`);

    // Product applications only (operator CLI offers have no applicant and do not block a seller applying themselves).
    const open = await Promise.all(
      (await listOffers()).filter((o) => o.applicant && o.seller.toLowerCase() === seller.toLowerCase() && ACTIVE.includes(o.status)).map(reconcileOffer),
    );
    const live = open.filter((o) => ACTIVE.includes(o.status));
    const mine = live.find((o) => o.applicant?.toLowerCase() === applicant.toLowerCase());
    if (mine) return { id: mine.id, existing: true };
    if (live.length) throw new HttpError(409, "Another account already has an open application for this revenue address.");

    if ((await kv.incr(`rl:apply:${applicant}`, 3600)) > 3) throw new HttpError(429, "Three applications per hour per account. Try again later.");
    if ((await kv.incr(`rl:apply:all`, 3600)) > 30) throw new HttpError(429, "Yieldline is reviewing a lot of applications right now. Try again within the hour.");

    const probe = await probe402(endpoint).catch((e) => ({ ok: false as const, status: 0, error: String(e?.message ?? e) }));
    if (!probe.ok) {
      const why = probe.status ? `HTTP ${probe.status}` : probe.error;
      throw new HttpError(400, `That URL did not return an x402 payment challenge (${why}).`, { probe });
    }
    // The endpoint must currently pay the address applying: revenue is underwritten, and the advance sent, to payout.
    if (probe.payTo !== seller.toLowerCase())
      throw new HttpError(400, `Your endpoint currently asks buyers to pay ${probe.payTo}, not ${seller}. Apply with the address your endpoint pays.`, { probe });

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

productApi.get("/applications/:id", wrap(async (req) => publicOffer(await reconcileOffer(await getOffer(String(req.params.id))))));

productApi.get(
  "/offers/:id/pools",
  wrap(async (req) => {
    const o = await getOffer(String(req.params.id));
    const [pools, enc] = await Promise.all([cached("pools", 5000, allPoolInfo), encumbrance(o.seller)]);
    return { offer: o.id, encumbered: !!enc, matches: match(o, pools, enc) };
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
    const [pools, enc] = await Promise.all([allPoolInfo(), encumbrance(o.seller)]);
    const m = match(o, pools, enc).find((x) => x.pool.toLowerCase() === pool.toLowerCase());
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
    const mine = await Promise.all(offers.filter((o) => o.applicant?.toLowerCase() === me || o.seller.toLowerCase() === me).map(reconcileOffer));
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

/** Unsigned read of a live x402 challenge, for the apply form (shows the payTo before the seller signs). */
productApi.get(
  "/probe",
  wrap(async (req) => {
    const url = String(req.query.url ?? "");
    if (!/^https?:\/\//.test(url)) throw new HttpError(400, "Enter the full URL (https://…).");
    if ((await kv.incr(`rl:probe:${ip(req)}`, 600)) > 30) throw new HttpError(429, "Too many checks; wait a few minutes.");
    await assertPublicUrl(url);
    return probe402(url).catch((e) => ({ ok: false as const, status: 0, error: String(e?.message ?? e) }));
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
    if (!["default", "approve", "reject"].includes(action)) throw new HttpError(400, "action must be default, approve or reject");
    if (typeof reason !== "string" || reason.trim().length < 10) throw new HttpError(400, "Write a reason of at least a sentence.");
    const account = await verifyRequest(req.body, "curate", getAddress(pool));
    const p = await readPool(getAddress(pool));
    if (p.curator.toLowerCase() !== account.toLowerCase() || isV1(p.address)) throw new HttpError(403, "Only this pool's curator can record its decisions.");
    const rec = await recordDecision({
      agent: "human",
      subject: p.address,
      pool: p.address,
      action: action === "default" ? "mark_default" : action === "reject" ? "reject_proposal" : "approve_proposal",
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
