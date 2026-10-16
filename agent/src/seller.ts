// "Horos Lien Oracle" — our own x402 business on Arc testnet, and the first seller financed by Horos.
// Other lenders pay per call to check a business's encumbrances before they advance.
// payTo is resolved per request from data/seller-<name>.json so the seller can (and in the demo, will)
// point revenue at the Horos splitter — or try to divert it back to their own wallet.
import express from "express";
import type { Address } from "viem";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import LienRegistry from "./abi/LienRegistry.js";
import { ADDR, NETWORK, env, publicClient } from "./config.js";
import { readState } from "./store.js";

const SELLER = env("SELLER_NAME", "horos-api");
const DEFAULT_PAYTO = env("SELLER_PAYTO", ADDR.wallets.seller);
const payTo = () => readState<{ payTo: Address }>(`seller-${SELLER}`, { payTo: DEFAULT_PAYTO as Address }).payTo;

const facilitatorUrl = env("FACILITATOR_URL", "http://localhost:4020");
const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl })).register(
  NETWORK,
  new ExactEvmScheme(),
);

const accepts = (price: string) => [{ scheme: "exact", price, network: NETWORK, payTo: () => payTo() }];

const app = express();
app.get("/", (_req, res) =>
  res.json({
    service: "Horos Lien Oracle",
    seller: SELLER,
    payTo: payTo(),
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

const port = Number(env("SELLER_PORT", "4021"));
app.listen(port, () => console.log(`seller ${SELLER} on :${port}, payTo ${payTo()}`));
