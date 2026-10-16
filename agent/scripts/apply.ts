// Apply as a seller through the product API with a throwaway local key (smoke test for the signed flow).
//   tsx scripts/apply.ts <endpoint> <payout> [api]
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildMessage } from "../src/auth.js";

const [endpoint, payout, api = "http://localhost:4021"] = process.argv.slice(2);
const acct = privateKeyToAccount((process.env.APPLY_KEY as `0x${string}`) ?? generatePrivateKey());
const message = buildMessage({
  action: "apply",
  subject: endpoint,
  account: acct.address,
  nonce: Math.random().toString(16).slice(2),
  expires: new Date(Date.now() + 5 * 60_000).toISOString(),
});
const signature = await acct.signMessage({ message });
const r = await fetch(`${api}/api/applications`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ endpoint, payout, message, signature }),
});
console.log(r.status, JSON.stringify(await r.json()));
