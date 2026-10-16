// Which pools can fund an offer. Pure: the same rules the pool contract enforces, phrased for the seller.
import type { Address } from "viem";

export type PoolLimits = {
  maxAdvanceUsdc: number;
  autoApproveLimitUsdc: number;
  maxExposureBps: number;
  minSweepBps: number;
  maxSweepBps: number;
  maxFeeBps: number;
  maxTermDays: number;
  maxRiskScore: number;
};

export type MatchPool = {
  address: Address | string;
  name: string;
  version: 1 | 2;
  liquidityUsdc: number;
  totalAssetsUsdc: number;
  limits: PoolLimits;
};

export type OfferTerms = { advanceUsdc: number; sweepBps: number; feeBps: number; termDays: number; riskScore: number };

export type PoolMatch = {
  pool: string;
  name: string;
  eligible: boolean;
  reasons: string[];
  needsCuratorApproval: boolean;
  liquidityUsdc: number;
};

const pct = (bps: number) => `${bps / 100}%`;

/** `encumbered`: false, or the seller's live lien (id and the name of the pool holding it). */
export function match(o: OfferTerms, pools: MatchPool[], encumbered: false | { liveLienId: number; pool: string }): PoolMatch[] {
  return pools
    .map((p) => {
      const l = p.limits;
      const reasons: string[] = [];
      if (p.version === 1) reasons.push("Operator pilot pool, closed to new advances.");
      if (encumbered)
        reasons.push(`This seller already has live lien #${encumbered.liveLienId} (${encumbered.pool}); no second pool can advance against the same revenue until it closes.`);
      if (o.riskScore > l.maxRiskScore) reasons.push(`Risk score ${o.riskScore} is above this pool's appetite (${l.maxRiskScore}).`);
      if (o.advanceUsdc > l.maxAdvanceUsdc) reasons.push(`Advance $${o.advanceUsdc} is above this pool's max advance ($${l.maxAdvanceUsdc}).`);
      if (o.sweepBps < l.minSweepBps || o.sweepBps > l.maxSweepBps)
        reasons.push(`Sweep ${pct(o.sweepBps)} is outside this pool's range (${pct(l.minSweepBps)}–${pct(l.maxSweepBps)}).`);
      if (o.feeBps > l.maxFeeBps) reasons.push(`Fee ${pct(o.feeBps)} is above this pool's cap (${pct(l.maxFeeBps)}).`);
      if (o.termDays > l.maxTermDays) reasons.push(`Term ${o.termDays}d is longer than this pool allows (${l.maxTermDays}d).`);
      if (o.advanceUsdc > p.liquidityUsdc) reasons.push(`Not enough free cash ($${p.liquidityUsdc.toFixed(2)} available).`);
      if (o.advanceUsdc * 10_000 > p.totalAssetsUsdc * l.maxExposureBps)
        reasons.push(`Exposure limit: one seller can take at most ${pct(l.maxExposureBps)} of this pool ($${((p.totalAssetsUsdc * l.maxExposureBps) / 10_000).toFixed(2)}).`);
      return {
        pool: p.address,
        name: p.name,
        eligible: reasons.length === 0,
        reasons,
        needsCuratorApproval: o.advanceUsdc > l.autoApproveLimitUsdc,
        liquidityUsdc: p.liquidityUsdc,
      };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.liquidityUsdc - a.liquidityUsdc);
}
