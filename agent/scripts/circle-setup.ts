// One-time: register entity secret, create wallet set + Yieldline wallets on ARC-TESTNET.
import "dotenv/config";
import { config } from "dotenv";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

config({ path: resolve(import.meta.dirname, "../../.env") });
const apiKey = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const out = resolve(import.meta.dirname, "../../.circle/wallets.json");

async function main() {
  try {
    await registerEntitySecretCiphertext({
      apiKey,
      entitySecret,
      recoveryFileDownloadPath: resolve(import.meta.dirname, "../../.circle"),
    });
    console.log("entity secret registered");
  } catch (e: any) {
    console.log("register skipped:", e?.response?.data?.message ?? e?.message);
  }

  const c = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  if (existsSync(out)) {
    console.log("already set up:", readFileSync(out, "utf8"));
    return;
  }
  const ws = await c.createWalletSet({ name: "Yieldline" });
  const walletSetId = ws.data!.walletSet!.id;
  const names = ["pool-operator", "underwriting-agent", "monitor-agent", "seller-yieldline-api", "buyer-1", "buyer-2", "buyer-3"];
  const res = await c.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: names.length,
    walletSetId,
    accountType: "EOA",
    metadata: names.map((name) => ({ name, refId: name })),
  });
  const wallets = res.data!.wallets!.map((w, i) => ({ name: names[i], id: w.id, address: w.address }));
  writeFileSync(out, JSON.stringify({ walletSetId, wallets }, null, 2));
  console.table(wallets);
}
main().catch((e) => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
