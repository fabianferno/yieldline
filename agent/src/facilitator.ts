// Self-hosted x402 facilitator for Arc testnet (no public facilitator lists eip155:5042002 for the exact scheme).
// It settles EIP-3009 transferWithAuthorization straight to payTo, and adds two Horos behaviours:
//   1. Lien-aware settlement: a payment routed to a seller's own wallet while that seller has a live lien
//      is refused, with the splitter address the buyer should be paying instead.
//   2. Keeper: after settling into a Horos splitter it calls split() so sweeps happen in real time.
import express from "express";
import type { Address } from "viem";
import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme as ExactFacilitator } from "@x402/evm/exact/facilitator";
import LienRegistry from "./abi/LienRegistry.js";
import LenderPool from "./abi/LenderPool.js";
import RevenueSplitter from "./abi/RevenueSplitter.js";
import { ADDR, NETWORK, env, operatorAccount, operatorClient, publicClient } from "./config.js";
import { recordEvent } from "./store.js";


const signer = toFacilitatorEvmSigner({
  address: operatorAccount.address,
  readContract: (a) => publicClient.readContract(a as never),
  verifyTypedData: (a) => publicClient.verifyTypedData(a as never),
  writeContract: (a) => operatorClient.writeContract(a as never),
  sendTransaction: (a) => operatorClient.sendTransaction(a),
  waitForTransactionReceipt: (a) => publicClient.waitForTransactionReceipt(a),
  getCode: (a) => publicClient.getCode(a),
});

const facilitator = new x402Facilitator().register(NETWORK, new ExactFacilitator(signer));

async function lienGuard(payTo: Address): Promise<string | null> {
  const lienId = (await publicClient.readContract({
    address: ADDR.registry,
    abi: LienRegistry,
    functionName: "liveLienOfSeller",
    args: [payTo],
  })) as bigint;
  if (lienId === 0n) return null;
  const lien = (await publicClient.readContract({
    address: ADDR.registry,
    abi: LienRegistry,
    functionName: "lien",
    args: [lienId],
  })) as { payTo: Address };
  return `encumbered_payee: seller has live lien #${lienId}; revenue must be paid to ${lien.payTo}`;
}

async function keeperSplit(payTo: Address) {
  const seller = (await publicClient.readContract({
    address: ADDR.pool,
    abi: LenderPool,
    functionName: "sellerOfSplitter",
    args: [payTo],
  })) as Address;
  if (seller === "0x0000000000000000000000000000000000000000") return;
  const hash = await operatorClient.writeContract({
    address: payTo,
    abi: RevenueSplitter,
    functionName: "split",
  });
  await publicClient.waitForTransactionReceipt({ hash });
  recordEvent({ kind: "keeper.split", seller, splitter: payTo, txHash: hash });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/supported", (_req, res) => res.json(facilitator.getSupported()));

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const blocked = await lienGuard(paymentRequirements.payTo);
    if (blocked) return res.json({ isValid: false, invalidReason: blocked });
    res.json(await facilitator.verify(paymentPayload, paymentRequirements));
  } catch (e: any) {
    res.status(500).json({ isValid: false, invalidReason: e?.message ?? String(e) });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const blocked = await lienGuard(paymentRequirements.payTo);
    if (blocked) return res.json({ success: false, errorReason: blocked, transaction: "", network: NETWORK });
    const out = await facilitator.settle(paymentPayload, paymentRequirements);
    if (out.success) {
      recordEvent({
        kind: "x402.settled",
        payTo: paymentRequirements.payTo,
        payer: out.payer,
        amount: paymentRequirements.amount,
        resource: paymentPayload?.resource?.url,
        txHash: out.transaction,
      });
      keeperSplit(paymentRequirements.payTo).catch((e) => console.error("keeper split failed", e.message));
    }
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ success: false, errorReason: e?.message ?? String(e), transaction: "", network: NETWORK });
  }
});

const port = Number(env("FACILITATOR_PORT", "4020"));
app.listen(port, () => console.log(`horos facilitator on :${port} (${NETWORK}, signer ${operatorAccount.address})`));
