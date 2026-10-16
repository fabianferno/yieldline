import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { AuthError, buildMessage, parseMessage, verifyRequest } from "../src/auth.js";

const acct = privateKeyToAccount(generatePrivateKey());
const localVerify = (a: { address: `0x${string}`; message: string; signature: `0x${string}` }) => verifyMessage(a);
const future = () => new Date(Date.now() + 5 * 60_000).toISOString();
const nonce = () => Math.random().toString(16).slice(2);

async function signed(over: Partial<Parameters<typeof buildMessage>[0]> = {}) {
  const message = buildMessage({ action: "apply", subject: "https://x.test/api", account: acct.address, nonce: nonce(), expires: future(), ...over });
  return { message, signature: await acct.signMessage({ message }) };
}

test("round trip parse", () => {
  const f = { action: "accept", subject: "abc", account: acct.address, nonce: "n1", expires: future() };
  assert.deepEqual(parseMessage(buildMessage(f)), f);
});

test("valid request returns the account", async () => {
  const addr = await verifyRequest(await signed(), "apply", "https://x.test/api", localVerify);
  assert.equal(addr, acct.address);
});

test("wrong action is rejected", async () => {
  await assert.rejects(verifyRequest(await signed(), "accept", undefined, localVerify), (e: any) => e instanceof AuthError && e.status === 401);
});

test("wrong subject is rejected", async () => {
  await assert.rejects(verifyRequest(await signed(), "apply", "https://other.test", localVerify), AuthError);
});

test("expired request is rejected", async () => {
  const r = await signed({ expires: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(verifyRequest(r, "apply", undefined, localVerify), /expired/);
});

test("replay is rejected", async () => {
  const r = await signed();
  await verifyRequest(r, "apply", undefined, localVerify);
  await assert.rejects(verifyRequest(r, "apply", undefined, localVerify), /already used/);
});

test("signature from another key is rejected", async () => {
  const other = privateKeyToAccount(generatePrivateKey());
  const message = buildMessage({ action: "apply", subject: "s", account: acct.address, nonce: nonce(), expires: future() });
  const signature = await other.signMessage({ message });
  await assert.rejects(verifyRequest({ message, signature }, "apply", undefined, localVerify), /signature/);
});

test("expiry too far ahead is rejected", async () => {
  const r = await signed({ expires: new Date(Date.now() + 2 * 3600_000).toISOString() });
  await assert.rejects(verifyRequest(r, "apply", undefined, localVerify), /expir/);
});
