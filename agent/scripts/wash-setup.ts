// Demo adversary: a "seller" that manufactures x402 revenue by funding its own buyers.
// Creates wash-seller + 3 shill wallets (Circle), operator seeds the wash seller, the wash seller funds the shills.
// The shills then pay the wash seller's x402 endpoint (see `pnpm wash:traffic`), creating real but circular receipts.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADDR, ROOT, env, publicClient } from "../src/config.js";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { circle, circleExecute } from "../src/circle.js";
import { parseAbi } from "viem";

const file = resolve(ROOT, ".circle/wallets.json");
const state = JSON.parse(readFileSync(file, "utf8"));
let wash = state.wallets.filter((w: any) => w.name.startsWith("wash-"));
if (!wash.length) {
  const names = ["wash-seller", "wash-shill-1", "wash-shill-2", "wash-shill-3"];
  const res = await circle.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: names.length,
    walletSetId: state.walletSetId,
    accountType: "EOA",
    metadata: names.map((name) => ({ name, refId: name })),
  });
  wash = res.data!.wallets!.map((w, i) => ({ name: names[i], id: w.id, address: w.address }));
  state.wallets.push(...wash);
  writeFileSync(file, JSON.stringify(state, null, 2));
}
const seller = wash.find((w: any) => w.name === "wash-seller");
const shills = wash.filter((w: any) => w.name.startsWith("wash-shill"));
console.log("wash seller", seller.address);

const operatorClient = createWalletClient({ account: privateKeyToAccount(env("DEPLOYER_PRIVATE_KEY") as `0x${string}`), chain: arcTestnet, transport: http() });
const erc20 = parseAbi(["function transfer(address,uint256) returns (bool)"]);
const h = await operatorClient.writeContract({ address: ADDR.usdc, abi: erc20, functionName: "transfer", args: [seller.address, 3_000_000n] });
await publicClient.waitForTransactionReceipt({ hash: h });
console.log("operator -> wash seller 3 USDC", h);

for (const s of shills) {
  const r = await circleExecute({
    walletId: seller.id,
    contractAddress: ADDR.usdc,
    abiFunctionSignature: "transfer(address,uint256)",
    abiParameters: [s.address, "800000"],
  });
  console.log("wash seller -> shill", s.address, r.txHash);
}
