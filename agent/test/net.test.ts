import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublicUrl, isPrivateIp } from "../src/net.js";

test("private and special addresses", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::"])
    assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "76.76.21.21", "2606:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});

const resolver = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

test("rejects hostnames that resolve to private addresses", async () => {
  await assert.rejects(checkPublicUrl("https://evil.example/x", resolver({ "evil.example": ["169.254.169.254"] })), /public/);
  await assert.rejects(checkPublicUrl("http://169.254.169.254.nip.io/", resolver({ "169.254.169.254.nip.io": ["169.254.169.254"] })), /public/);
  await assert.rejects(checkPublicUrl("http://localhost:4021/x", resolver({ localhost: ["127.0.0.1"] })), /public/);
});

test("rejects non-standard ports and schemes", async () => {
  await assert.rejects(checkPublicUrl("https://api.example:8443/x", resolver({ "api.example": ["8.8.8.8"] })), /port/);
  await assert.rejects(checkPublicUrl("ftp://api.example/x", resolver({ "api.example": ["8.8.8.8"] })), /https/);
});

test("accepts a public https endpoint", async () => {
  await checkPublicUrl("https://api.example/v1/paid", resolver({ "api.example": ["8.8.8.8", "2606:4700::1111"] }));
});

test("rejects names that do not resolve", async () => {
  await assert.rejects(checkPublicUrl("https://nowhere.example/", resolver({})), /resolve/);
});
