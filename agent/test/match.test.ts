import { test } from "node:test";
import assert from "node:assert/strict";
import { match, type MatchPool } from "../src/match.js";

const pool = (over: Partial<MatchPool> = {}): MatchPool => ({
  address: "0x0000000000000000000000000000000000000c0e",
  name: "Core",
  version: 2,
  liquidityUsdc: 5,
  totalAssetsUsdc: 20,
  limits: { maxAdvanceUsdc: 10, autoApproveLimitUsdc: 5, maxExposureBps: 4000, minSweepBps: 500, maxSweepBps: 5000, maxFeeBps: 1500, maxTermDays: 14, maxRiskScore: 60 },
  ...over,
});
const offer = { advanceUsdc: 3, sweepBps: 2000, feeBps: 800, termDays: 7, riskScore: 40 };

test("eligible pool", () => {
  const [m] = match(offer, [pool()], false);
  assert.equal(m.eligible, true);
  assert.deepEqual(m.reasons, []);
  assert.equal(m.needsCuratorApproval, false);
});

test("risk above appetite", () => {
  const [m] = match({ ...offer, riskScore: 70 }, [pool()], false);
  assert.equal(m.eligible, false);
  assert.match(m.reasons[0], /risk score 70 is above this pool's appetite \(60\)/i);
});

test("not enough free cash", () => {
  const [m] = match(offer, [pool({ liquidityUsdc: 2 })], false);
  assert.equal(m.eligible, false);
  assert.ok(m.reasons.some((r) => /free cash/i.test(r)));
});

test("exposure limit", () => {
  const [m] = match(offer, [pool({ totalAssetsUsdc: 5 })], false); // 40% of 5 = 2 < 3
  assert.equal(m.eligible, false);
  assert.ok(m.reasons.some((r) => /exposure/i.test(r)));
});

test("v1 pool is closed", () => {
  const [m] = match(offer, [pool({ version: 1 })], false);
  assert.equal(m.eligible, false);
  assert.ok(m.reasons.some((r) => /closed to new advances/i.test(r)));
});

test("encumbered seller: nothing eligible", () => {
  const ms = match(offer, [pool(), pool({ name: "Steady" })], true);
  assert.ok(ms.every((m) => !m.eligible && m.reasons.some((r) => /already has a live lien/i.test(r))));
});

test("above auto-approve needs curator", () => {
  const [m] = match({ ...offer, advanceUsdc: 7 }, [pool({ liquidityUsdc: 10, totalAssetsUsdc: 30 })], false);
  assert.equal(m.eligible, true);
  assert.equal(m.needsCuratorApproval, true);
});

test("terms outside pool limits", () => {
  const [m] = match({ ...offer, sweepBps: 400, feeBps: 2000, termDays: 30 }, [pool()], false);
  assert.equal(m.eligible, false);
  assert.equal(m.reasons.length, 3);
});

test("eligible pools sort first, then by free cash", () => {
  const risky = pool({ name: "Tight", limits: { ...pool().limits, maxRiskScore: 10 } });
  const ms = match(offer, [risky, pool({ name: "Small", liquidityUsdc: 4 }), pool({ name: "Big", liquidityUsdc: 9, totalAssetsUsdc: 40 })], false);
  assert.deepEqual(ms.map((m) => m.name), ["Big", "Small", "Tight"]);
});
