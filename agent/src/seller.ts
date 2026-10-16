// "Horos Lien Oracle" — our own x402 business on Arc testnet, and the first seller financed by Horos.
// Other lenders pay per call to check a business's encumbrances before they advance.
// payTo is resolved per request (see payTo()) so it follows the seller's Horos splitter — and so a seller
// can try to divert revenue back to their own wallet, which the monitoring agent must catch.
import express from "express";
import type { Address } from "viem";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import LienRegistry from "./abi/LienRegistry.js";
import LenderPool from "./abi/LenderPool.js";
import { ADDR, NETWORK, env, publicClient } from "./config.js";
import { readState } from "./store.js";

const SELLER = env("SELLER_NAME", "horos-api");
const SELLER_WALLET = env("SELLER_WALLET", ADDR.wallets.seller) as Address;
const ZERO = "0x0000000000000000000000000000000000000000";

// payTo resolution, in priority order:
//   1. SELLER_PAYTO_OVERRIDE env / data/seller-<name>.json  (the seller's own config — and how a diversion happens)
//   2. the seller's Horos RevenueSplitter, once one exists   (the seller's commitment after accepting an advance)
//   3. the seller's own wallet
let cache: { at: number; v: Address } | null = null;
export async function payTo(): Promise<Address> {
  const override = process.env.SELLER_PAYTO_OVERRIDE ?? readState<{ payTo?: Address }>(`seller-${SELLER}`, {}).payTo;
  if (override) return override as Address;
  if (cache && Date.now() - cache.at < 5_000) return cache.v;
  const splitter = (await publicClient.readContract({
    address: ADDR.pool,
    abi: LenderPool,
    functionName: "splitterOf",
    args: [SELLER_WALLET],
  })) as Address;
  cache = { at: Date.now(), v: splitter === ZERO ? SELLER_WALLET : splitter };
  return cache.v;
}

const facilitatorUrl = env("FACILITATOR_URL", "http://localhost:4021/facilitator");
const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl })).register(
  NETWORK,
  new ExactEvmScheme(),
);

const accepts = (price: string) => [{ scheme: "exact", price, network: NETWORK, payTo: () => payTo() }];

export const sellerApp = express.Router();
const app = sellerApp;
app.get("/oracle", async (_req, res) =>
  res.json({
    service: "Horos Lien Oracle",
    seller: SELLER,
    sellerWallet: SELLER_WALLET,
    payTo: await payTo(),
    endpoints: { "GET /v1/lien/:address": "$0.01", "GET /v1/credit/:address": "$0.02" },
  }),
);

app.use(
  paymentMiddleware(
    {
      "GET /v1/lien/*": { accepts: accepts("$0.01"), description: "Live lien / encumbrance lookup for a seller" },
      "GET /v1/credit/*": { accepts: accepts("$0.02"), description: "Repayment record for a seller" },
    } as never,
    server,
  ),
);

app.get("/v1/lien/:address", async (req, res) => {
  const seller = req.params.address as Address;
  const [total, liveLienId] = (await publicClient.readContract({
    address: ADDR.registry,
    abi: LienRegistry,
    functionName: "encumbrance",
    args: [seller],
  })) as [bigint, bigint];
  const lien =
    liveLienId === 0n
      ? null
      : await publicClient.readContract({ address: ADDR.registry, abi: LienRegistry, functionName: "lien", args: [liveLienId] });
  res.json({ seller, encumbered: liveLienId !== 0n, outstanding: total.toString(), lienId: liveLienId.toString(), lien });
});

app.get("/v1/credit/:address", async (req, res) => {
  const seller = req.params.address as Address;
  const [opened, repaid, defaulted, frozenEvents] = (await publicClient.readContract({
    address: ADDR.registry,
    abi: LienRegistry,
    functionName: "recordOf",
    args: [seller],
  })) as [number, number, number, number];
  res.json({ seller, opened, repaid, defaulted, frozenEvents });
});

