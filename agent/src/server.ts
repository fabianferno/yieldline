// Public Yieldline API: x402 facilitator (/facilitator/*) + Yieldline Lien Oracle seller (/v1/*) + read API (/api/*).
import express from "express";
import { facilitatorRouter } from "./facilitator.js";
import { sellerApp } from "./seller.js";
import { readApi } from "./readApi.js";
import { productApi } from "./productApi.js";

export const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use("/facilitator", facilitatorRouter);
app.use("/api", productApi);
app.use("/api", readApi);
app.use(sellerApp);
app.get("/", (_req, res) => res.redirect("/oracle"));

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4021);
  app.listen(port, () => console.log(`yieldline api on :${port}`));
}
