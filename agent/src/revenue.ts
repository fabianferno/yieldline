// Revenue + payer forensics from on-chain x402 receipts on Arc (Blockscout API).
// x402 "exact" settles via USDC.transferWithAuthorization, so receipts are ERC-20 transfers into payTo
// whose tx method is transferWithAuthorization.
import type { Address } from "viem";
import { ADDR, EXPLORER } from "./config.js";

export type Transfer = {
  from: Address;
  to: Address;
  value: bigint;
  ts: number;
  tx: string;
  method: string | null;
  source?: "exact" | "gateway";
  status?: string; // gateway: received | batched | confirmed | completed | failed
};

const GATEWAY = "https://gateway-api-testnet.circle.com/v1/x402/transfers";

/** Circle Gateway (Nanopayments) x402 transfers to a seller. Batched settlement moves Gateway balances, not
 *  ERC-20 Transfers, so these are invisible to a plain token-transfer index. Unsettled ones are receivables. */
export async function gatewayTransfers(addr: Address, maxPages = 30): Promise<Transfer[]> {
  const out: Transfer[] = [];
  let url = `${GATEWAY}?network=eip155:5042002&to=${addr}&pageSize=100`;
  for (let p = 0; p < maxPages && url; p++) {
    const r = await fetch(url, { headers: { "user-agent": "horos-underwriter" } });
    if (!r.ok) break;
    const d = await r.json();
    for (const i of d.transfers ?? []) {
      if (i.status === "failed" || i.toAddress?.toLowerCase() !== addr.toLowerCase()) continue;
      out.push({
        from: lc(i.fromAddress),
        to: lc(i.toAddress),
        value: BigInt(i.amount),
        ts: Date.parse(i.createdAt) / 1000,
        tx: i.txHash ?? i.id,
        method: "gateway-batched",
        source: "gateway",
        status: i.status,
      });
    }
    const next = /<([^>]+)>; rel="next"/.exec(r.headers.get("link") ?? "");
    url = d.transfers?.length && next ? next[1] : "";
  }
  return out;
}

const lc = (a: string) => a.toLowerCase() as Address;

// transferWithAuthorization(v,r,s) = 0xe3ee160e, (bytes signature) = 0xcf092995; Blockscout returns name or selector.
const X402_METHODS = new Set(["transferwithauthorization", "0xe3ee160e", "0xcf092995", "gateway-batched"]);
// Public Circle testnet faucet hot wallets on Arc: a shared faucet funder is not evidence of related parties.
export const KNOWN_FAUCETS = new Set([
  "0xd844ba11f64d23a7481e24474d2f184e350b9b3d",
  "0x319dd63e0ac72e7ac74443029d074032c043460f",
  "0x3c3380cdfb94dfeeaa41cad9f58254ae380d752d",
  "0x70e3fb28e1794bb91d5bceb7d66b731d0c61af8e",
]);
const PUBLIC_HUB_TX_COUNT = 50_000; // funders this busy are faucets / exchanges / bridges, not counterparties

const hubCache = new Map<string, boolean>();
async function isPublicHub(addr: Address): Promise<boolean> {
  if (KNOWN_FAUCETS.has(addr)) return true;
  if (hubCache.has(addr)) return hubCache.get(addr)!;
  const d = await getJson(`${EXPLORER}/api/v2/addresses/${addr}/counters`).catch(() => null);
  const hub = Number(d?.transactions_count ?? 0) > PUBLIC_HUB_TX_COUNT;
  hubCache.set(addr, hub);
  return hub;
}

export const isX402 = (t: Transfer) => !!t.method && X402_METHODS.has(t.method.toLowerCase());

async function getJson(url: string) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((s) => setTimeout(s, 700 * (i + 1)));
  }
  throw new Error(`explorer ${url} failed`);
}

export async function usdcTransfers(addr: Address, filter: "to" | "from", maxPages = 20): Promise<Transfer[]> {
  const out: Transfer[] = [];
  let params = "";
  for (let p = 0; p < maxPages; p++) {
    const d = await getJson(
      `${EXPLORER}/api/v2/addresses/${addr}/token-transfers?type=ERC-20&filter=${filter}&token=${ADDR.usdc}${params}`,
    );
    for (const i of d.items ?? []) {
      if (lc(i.token?.address_hash ?? i.token?.address ?? ADDR.usdc) !== lc(ADDR.usdc)) continue;
      out.push({
        from: lc(i.from.hash),
        to: lc(i.to.hash),
        value: BigInt(i.total.value),
        ts: Date.parse(i.timestamp) / 1000,
        tx: i.transaction_hash,
        method: i.method ?? null,
      });
    }
    if (!d.next_page_params) break;
    params = "&" + new URLSearchParams(d.next_page_params).toString();
  }
  return out;
}

async function firstSeen(addr: Address): Promise<{ ts: number | null; funder: Address | null; txCount: number }> {
  const d = await getJson(`${EXPLORER}/api/v2/addresses/${addr}/counters`).catch(() => null);
  const txCount = Number(d?.transactions_count ?? 0) + Number(d?.token_transfers_count ?? 0);
  const inbound = await usdcTransfers(addr, "to", 5);
  if (!inbound.length) return { ts: null, funder: null, txCount };
  const first = inbound.reduce((a, b) => (a.ts <= b.ts ? a : b));
  return { ts: first.ts, funder: first.from, txCount };
}

export type RevenueProfile = Awaited<ReturnType<typeof revenueProfile>>;

/** Deterministic features the underwriting agent reasons over. All amounts in USDC (float). */
export async function revenueProfile(seller: Address, extraPayTo: Address[] = []) {
  const now = Date.now() / 1000;
  const sinks = [seller, ...extraPayTo].map(lc);
  const [exact, gateway] = await Promise.all([
    Promise.all(sinks.map((s) => usdcTransfers(s, "to"))).then((x) => x.flat()),
    Promise.all(sinks.map((s) => gatewayTransfers(s).catch(() => []))).then((x) => x.flat()),
  ]);
  const all = [...exact.map((t) => ({ ...t, source: "exact" as const })), ...gateway];
  const internal = new Set([lc(ADDR.pool), ...sinks]);
  const receipts = all.filter((t) => isX402(t) && !internal.has(t.from));
  const other = all.filter((t) => !isX402(t) && !internal.has(t.from));

  const amt = (ts: Transfer[]) => ts.reduce((s, t) => s + Number(t.value) / 1e6, 0);
  const windowed = (days: number, offsetDays = 0) =>
    receipts.filter((t) => t.ts > now - (days + offsetDays) * 86400 && t.ts <= now - offsetDays * 86400);

  // daily series (last 14d)
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = windowed(1, 13 - i);
    return { day: 13 - i, usdc: +amt(d).toFixed(6), calls: d.length };
  });
  const mean = daily.reduce((s, d) => s + d.usdc, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((s, d) => s + (d.usdc - mean) ** 2, 0) / daily.length);

  // hourly series (last 48h) — hackathon-era sellers are hours old, not weeks
  const hourly = Array.from({ length: 48 }, (_, i) => {
    const lo = now - (48 - i) * 3600;
    const d = receipts.filter((t) => t.ts > lo && t.ts <= lo + 3600);
    return { hoursAgo: 47 - i, usdc: +amt(d).toFixed(6), calls: d.length };
  });

  // payer concentration
  const byPayer = new Map<Address, { usdc: number; calls: number }>();
  for (const t of receipts) {
    const p = byPayer.get(t.from) ?? { usdc: 0, calls: 0 };
    p.usdc += Number(t.value) / 1e6;
    p.calls++;
    byPayer.set(t.from, p);
  }
  const total = amt(receipts);
  const payers = [...byPayer.entries()].sort((a, b) => b[1].usdc - a[1].usdc);
  const hhi = total ? payers.reduce((s, [, p]) => s + (p.usdc / total) ** 2, 0) : 0;

  // inter-arrival regularity (bots firing on a fixed timer look very regular)
  const ts = receipts.map((t) => t.ts).sort((a, b) => a - b);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  const gMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const gCv = gaps.length && gMean ? Math.sqrt(gaps.reduce((s, g) => s + (g - gMean) ** 2, 0) / gaps.length) / gMean : null;

  // seller outflows (to detect seller funding its own payers)
  const sellerOut = await usdcTransfers(seller, "from", 5);
  const sellerFunded = new Set(sellerOut.map((t) => t.to));

  // payer forensics (top 12 payers by volume)
  const mapLimit = async <A, B>(xs: A[], n: number, f: (x: A) => Promise<B>) => {
    const out: B[] = [];
    for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(f))));
    return out;
  };
  const forensics = await mapLimit(
    payers.slice(0, 12), 4, async ([payer, p]) => {
      const fs = await firstSeen(payer);
      return {
        payer,
        usdc: +p.usdc.toFixed(6),
        calls: p.calls,
        share: +(p.usdc / (total || 1)).toFixed(3),
        walletAgeHours: fs.ts ? +((now - fs.ts) / 3600).toFixed(1) : null,
        fundedBy: fs.funder,
        fundedBySeller: sellerFunded.has(payer) || fs.funder === lc(seller),
        fundedByLenderOperator: fs.funder === lc(ADDR.admin),
        fundedByPublicFaucet: !!fs.funder && (await isPublicHub(fs.funder)),
        activity: fs.txCount,
      };
    },
  );
  const funders = new Map<string, number>();
  for (const f of forensics) if (f.fundedBy && !f.fundedByPublicFaucet) funders.set(f.fundedBy, (funders.get(f.fundedBy) ?? 0) + 1);
  const commonFunders = [...funders.entries()].filter(([, n]) => n > 1).map(([funder, payers]) => ({ funder, payers }));

  const firstReceipt = ts[0] ?? null;
  return {
    seller,
    payToSinks: sinks,
    x402Receipts: receipts.length,
    bySettlement: {
      exactOnChain: { calls: receipts.filter((t) => t.source === "exact").length, usdc: +amt(receipts.filter((t) => t.source === "exact")).toFixed(6) },
      gatewayBatched: { calls: receipts.filter((t) => t.source === "gateway").length, usdc: +amt(receipts.filter((t) => t.source === "gateway")).toFixed(6) },
    },
    // Paid by buyers, recorded by Circle Gateway, not yet batch-settled: true receivables.
    unsettledReceivablesUsdc: +amt(receipts.filter((t) => t.source === "gateway" && t.status !== "completed")).toFixed(6),
    x402RevenueUsdc: +total.toFixed(6),
    nonX402InflowsUsdc: +amt(other).toFixed(6),
    historyHours: firstReceipt ? +((now - firstReceipt) / 3600).toFixed(1) : 0,
    last24hUsdc: +amt(windowed(1)).toFixed(6),
    prev24hUsdc: +amt(windowed(1, 1)).toFixed(6),
    last7dUsdc: +amt(windowed(7)).toFixed(6),
    dailyMeanUsdc: +mean.toFixed(6),
    dailyCv: mean ? +(sd / mean).toFixed(3) : null,
    daily,
    hourly: hourly.filter((h) => h.calls > 0),
    distinctPayers: payers.length,
    payerHHI: +hhi.toFixed(3),
    topPayerShare: payers.length ? +(payers[0][1].usdc / total).toFixed(3) : 0,
    interArrivalCv: gCv === null ? null : +gCv.toFixed(3),
    avgTicketUsdc: receipts.length ? +(total / receipts.length).toFixed(6) : 0,
    payerForensics: forensics,
    payersFundedBySeller: forensics.filter((f) => f.fundedBySeller).length,
    payersFundedByLenderOperator: forensics.filter((f) => f.fundedByLenderOperator).length,
    payersFundedByPublicFaucet: forensics.filter((f) => f.fundedByPublicFaucet).length,
    commonFunders,
  };
}
