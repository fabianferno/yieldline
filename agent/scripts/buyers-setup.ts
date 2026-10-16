// Create additional buyer wallets and fund them straight from Circle's testnet faucet API,
// so payers are independently funded (not by the seller or the pool operator).
// Usage: tsx scripts/buyers-setup.ts <count> [prefix=buyer]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../src/config.js";
import { circle } from "../src/circle.js";

const count = Number(process.argv[2] ?? 5);
const prefix = process.argv[3] ?? "buyer";
const file = resolve(ROOT, ".circle/wallets.json");
const state = JSON.parse(readFileSync(file, "utf8"));
const existing = state.wallets.filter((w: any) => w.name.startsWith(`${prefix}-`)).length;
const names = Array.from({ length: count }, (_, i) => `${prefix}-${existing + i + 1}`);

const res = await circle.createWallets({
  blockchains: ["ARC-TESTNET"],
  count,
  walletSetId: state.walletSetId,
  accountType: "EOA",
  metadata: names.map((name) => ({ name, refId: name })),
});
const created = res.data!.wallets!.map((w, i) => ({ name: names[i], id: w.id, address: w.address }));
state.wallets.push(...created);
writeFileSync(file, JSON.stringify(state, null, 2));
console.log("NOTE: re-run the deployments.ts generator to publish new wallets to the app");

for (const w of created) {
  try {
    await circle.requestTestnetTokens({ address: w.address!, blockchain: "ARC-TESTNET", usdc: true });
    console.log("faucet ok", w.name, w.address);
  } catch (e: any) {
    console.log("faucet failed", w.name, e?.response?.status, JSON.stringify(e?.response?.data ?? e?.message));
  }
}
