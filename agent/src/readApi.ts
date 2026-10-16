// Read API for the dashboard + lien explorer, and an authenticated trigger for the agents.
import express, { Router } from "express";
import type { Address } from "viem";
import { allLiens, lienInfo, poolState, splitterStats } from "./chain.js";
import { activity } from "./decisions.js";
import { ADDR, EXPLORER } from "./config.js";
import { revenueProfile } from "./revenue.js";

export const readApi = Router();
readApi.use(express.json());

const memo = new Map<string, { at: number; v: unknown }>();
const cached = async <T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
};

const wrap = (fn: (req: express.Request) => Promise<unknown>) => async (req: express.Request, res: express.Response) => {
  try {
    res.json(await fn(req));
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
};

readApi.get(
  "/overview",
  wrap(() =>
    cached("overview", 4000, async () => {
      const [pool, liens, feed] = await Promise.all([poolState(), allLiens(), activity()]);
      const withStats = await Promise.all(liens.map(async (l) => ({ ...l, splitter: await splitterStats(l.payTo) })));
      const decisions = feed.filter((f) => f.event === "Decision" && f.decision);
      const metrics = {
        sellersFinanced: new Set(liens.map((l) => l.seller)).size,
        advances: liens.length,
        advancedUsdc: pool.totalAdvancedUsdc,
        repaidViaSweepsUsdc: pool.totalRepaidUsdc,
        decisions: decisions.length,
        escalated: decisions.filter((d: any) => d.decision.escalated).length,
        rejected: decisions.filter((d: any) => d.decision.action === "reject").length,
        freezes: decisions.filter((d: any) => d.decision.action === "freeze").length,
        revenueRoutedUsdc: withStats.reduce((s, l) => s + l.splitter.receivedUsdc, 0),
      };
      return { addresses: { ...ADDR, explorer: EXPLORER }, pool, liens: withStats, metrics, feed };
    }),
  ),
);

readApi.get(
  "/seller/:address",
  wrap((req) =>
    cached(`seller:${req.params.address}`, 15000, async () => {
      const a = req.params.address as Address;
      const [lien, revenue] = await Promise.all([lienInfo(a), revenueProfile(a)]);
      return { lien, revenue };
    }),
  ),
);

readApi.get("/lien/:address", wrap((req) => lienInfo(req.params.address as Address)));
