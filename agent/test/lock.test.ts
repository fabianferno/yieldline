import { test } from "node:test";
import assert from "node:assert/strict";
import { withOfferLock } from "../src/lifecycle.js";

test("a second accept/fund on the same offer is refused while the first runs", async () => {
  const id = `t_${Math.random().toString(16).slice(2)}`;
  let release!: () => void;
  const first = withOfferLock(id, () => new Promise<string>((r) => (release = () => r("done"))));
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(withOfferLock(id, async () => "second"), /already being processed/);
  release();
  assert.equal(await first, "done");
});

test("different offers do not block each other", async () => {
  const a = withOfferLock(`a_${Date.now()}`, async () => 1);
  const b = withOfferLock(`b_${Date.now()}`, async () => 2);
  assert.deepEqual(await Promise.all([a, b]), [1, 2]);
});
