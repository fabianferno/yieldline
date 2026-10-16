// Offers, agent decisions and small state blobs, on top of the kv adapter (Redis on Vercel, files locally).
// Decisions are also hash-anchored on chain via logDecision; the stored record is the full trace behind that hash.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { DATA, kv } from "./kv.js";
import type { Offer } from "./underwriter.js";

export { DATA };

const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

/** Local operational log only (not shown in the product). */
export function recordEvent(e: Record<string, unknown>) {
  try {
    appendFileSync(resolve(DATA, "events.jsonl"), ser({ at: new Date().toISOString(), ...e }) + "\n");
  } catch {}
}

export type Decision = {
  id: string;
  at: string;
  agent: "underwriter" | "monitor" | "treasury" | "human";
  subject: string; // seller address or pool
  action: string; // e.g. offer, reject, continue, shrink, freeze, escalate, deploy_idle
  escalated: boolean;
  inputs: unknown;
  output: unknown;
  rationale: string;
  hash: `0x${string}`;
  txHash?: string;
  pool?: string;
};

export async function recordDecision(d: Omit<Decision, "id" | "at" | "hash">): Promise<Decision> {
  const at = new Date().toISOString();
  const body = { at, ...d };
  const hash = keccak256(toHex(ser(body)));
  const full: Decision = { id: hash.slice(0, 10), hash, ...body };
  await kv.hset("decisions", hash, full);
  return full;
}

export async function patchDecision(hash: string, patch: Partial<Decision>) {
  const d = await kv.hget<Decision>("decisions", hash);
  if (d) await kv.hset("decisions", hash, { ...d, ...patch });
}

export async function getDecision(hash: string) {
  return kv.hget<Decision>("decisions", hash);
}

export async function listDecisions() {
  return (await kv.hvals<Decision>("decisions")).sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------- offers

let migrated = false;
/** One-time move of the legacy local offers.json array (and decisions.jsonl) into the kv store. */
async function migrateLegacy() {
  if (migrated || kv.backend !== "files") return;
  migrated = true;
  const legacy = resolve(DATA, "offers.json");
  if (existsSync(legacy) && !existsSync(resolve(DATA, "h-offers.json"))) {
    for (const o of JSON.parse(readFileSync(legacy, "utf8")) as Offer[]) await kv.hset("offers", o.id, o);
  }
  const dl = resolve(DATA, "decisions.jsonl");
  if (existsSync(dl) && !existsSync(resolve(DATA, "h-decisions.json"))) {
    for (const line of readFileSync(dl, "utf8").split("\n").filter(Boolean)) {
      const d = JSON.parse(line) as Decision;
      await kv.hset("decisions", d.hash, d);
    }
  }
}

export async function putOffer(o: Offer) {
  await migrateLegacy();
  await kv.hset("offers", o.id, o);
}

export async function listOffers() {
  await migrateLegacy();
  return (await kv.hvals<Offer>("offers")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOffer(idOrHash: string) {
  await migrateLegacy();
  const direct = await kv.hget<Offer>("offers", idOrHash);
  if (direct) return direct;
  const o = (await listOffers()).find((x) => x.decisionHash === idOrHash);
  if (!o) throw new Error(`offer ${idOrHash} not found`);
  return o;
}

// ---------------------------------------------------------------- small state blobs

export async function readState<T>(name: string, fallback: T): Promise<T> {
  return (await kv.get<T>(`state-${name}`)) ?? (kv.backend === "files" ? legacyState(name, fallback) : fallback);
}

function legacyState<T>(name: string, fallback: T): T {
  const p = resolve(DATA, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}

export async function writeState(name: string, v: unknown) {
  await kv.set(`state-${name}`, v);
}
