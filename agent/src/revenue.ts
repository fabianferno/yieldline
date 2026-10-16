// Revenue + payer forensics from on-chain x402 receipts on Arc (Blockscout API).
// x402 "exact" settles via USDC.transferWithAuthorization, so receipts are ERC-20 transfers into payTo
// whose tx method is transferWithAuthorization.
import type { Address } from "viem";
import { ADDR, EXPLORER } from "./config.js";

export type Transfer = { from: Address; to: Address; value: bigint; ts: number; tx: string; method: string | null };

const lc = (a: string) => a.toLowerCase() as Address;

// transferWithAuthorization(v,r,s) = 0xe3ee160e, (bytes signature) = 0xcf092995; Blockscout returns name or selector.
const X402_METHODS = new Set(["transferwithauthorization", "0xe3ee160e", "0xcf092995"]);
// Public Circle testnet faucet on Arc: a shared faucet funder is not evidence of related parties.
export const KNOWN_FAUCETS = new Set(["0xd844ba11f64d23a7481e24474d2f184e350b9b3d"]);

export const isX402 = (t: Transfer) => !!t.method && X402_METHODS.has(t.method.toLowerCase());

async function getJson(url: string) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    await new Promise((s) => setTimeout(s, 500 * (i + 1)));
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
  const all = (await Promise.all(sinks.map((s) => usdcTransfers(s, "to")))).flat();
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
  const forensics = await Promise.all(
    payers.slice(0, 12).map(async ([payer, p]) => {
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
        fundedByPublicFaucet: !!fs.funder && KNOWN_FAUCETS.has(fs.funder),
        activity: fs.txCount,
      };
    }),
  );
  const funders = new Map<string, number>();
  for (const f of forensics) if (f.fundedBy && !KNOWN_FAUCETS.has(f.fundedBy)) funders.set(f.fundedBy, (funders.get(f.fundedBy) ?? 0) + 1);
  const commonFunders = [...funders.entries()].filter(([, n]) => n > 1).map(([funder, payers]) => ({ funder, payers }));

  const firstReceipt = ts[0] ?? null;
  return {
    seller,
    payToSinks: sinks,
    x402Receipts: receipts.length,
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
