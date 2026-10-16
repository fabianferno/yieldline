// Paid x402 calls from Circle developer-controlled buyer wallets (EIP-3009 authorizations signed via Circle API).
// Usage: tsx src/buyer.ts [calls=5] [baseUrl=http://localhost:4021]
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { ADDR, NETWORK, circleWallets, publicClient } from "./config.js";
import { circleSigner } from "./circle.js";

const calls = Number(process.argv[2] ?? 5);
const base = process.argv[3] ?? "http://localhost:4021";
const buyers = circleWallets().filter((w) => w.name.startsWith("buyer-"));
const targets = [ADDR.wallets.seller, ADDR.wallets.underwritingAgent, ADDR.pool, ...ADDR.wallets.buyers];

const fetchers = buyers.map((b) => ({
  name: b.name,
  fetch: wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      { network: NETWORK, client: new ExactEvmScheme(toClientEvmSigner(circleSigner(b.id, b.address), publicClient as never)) },
    ],
  }),
}));

for (let i = 0; i < calls; i++) {
  const f = fetchers[i % fetchers.length];
  const path = i % 3 === 2 ? "credit" : "lien";
  const url = `${base}/v1/${path}/${targets[i % targets.length]}`;
  const t0 = Date.now();
  try {
    const res = await f.fetch(url);
    const hdr = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    const receipt = hdr ? decodePaymentResponseHeader(hdr) : null;
    console.log(`${f.name} ${path} -> ${res.status} ${Date.now() - t0}ms tx=${receipt?.transaction ?? "-"}`);
    if (!res.ok) console.log("  ", (await res.text()).slice(0, 300));
  } catch (e: any) {
    console.log(`${f.name} ${path} -> error ${e?.message}`);
  }
}
