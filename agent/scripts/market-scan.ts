// Market scan: find real x402 sellers on Arc testnet from Circle Gateway (Nanopayments) receipts and run the
// underwriting agent on the most substantial ones. Every verdict is published on chain.
// Usage: tsx scripts/market-scan.ts [maxSellers=6] [maxPages=150]
import type { Address } from "viem";
import { underwrite } from "../src/underwriter.js";
import { writeState } from "../src/store.js";

const maxSellers = Number(process.argv[2] ?? 6);
const maxPages = Number(process.argv[3] ?? 150);
let url = "https://gateway-api-testnet.circle.com/v1/x402/transfers?network=eip155:5042002&pageSize=100";
const agg = new Map<string, { calls: number; usdc: number; payers: Set<string>; first: string; last: string }>();
for (let p = 0; p < maxPages && url; p++) {
  const r = await fetch(url, { headers: { "user-agent": "horos-market-scan" } });
  if (!r.ok) break;
  const d = await r.json();
  for (const t of d.transfers ?? []) {
    const k = t.toAddress.toLowerCase();
    const a = agg.get(k) ?? { calls: 0, usdc: 0, payers: new Set(), first: t.createdAt, last: t.createdAt };
    a.calls++;
    a.usdc += Number(t.amount) / 1e6;
    a.payers.add(t.fromAddress.toLowerCase());
    if (t.createdAt < a.first) a.first = t.createdAt;
    if (t.createdAt > a.last) a.last = t.createdAt;
    agg.set(k, a);
  }
  const next = /<([^>]+)>; rel="next"/.exec(r.headers.get("link") ?? "");
  url = d.transfers?.length && next ? next[1] : "";
}
const market = [...agg.entries()]
  .map(([seller, a]) => ({ seller, calls: a.calls, usdc: +a.usdc.toFixed(6), payers: a.payers.size, first: a.first, last: a.last }))
  .sort((x, y) => y.usdc - x.usdc);
writeState("market", market);
console.log(`Arc x402 market: ${market.length} sellers, ${market.reduce((s, m) => s + m.calls, 0)} paid calls`);

// Candidates: meaningful revenue, mix of single-payer and multi-payer sellers.
const candidates = market.filter((m) => m.usdc >= 0.2 && m.calls >= 10).slice(0, maxSellers);
for (const c of candidates) {
  try {
    const r = await underwrite(c.seller as Address, "");
    console.log(`${c.seller} ${c.calls} calls ${c.payers} payers $${c.usdc} -> ${r.offer.decision} ${r.offer.advanceUsdc} risk ${r.offer.riskScore} tx ${r.anchorTx}`);
  } catch (e: any) {
    console.log(`${c.seller} failed: ${e?.message}`);
  }
}
