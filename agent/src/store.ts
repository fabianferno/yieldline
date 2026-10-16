// Append-only local logs (events + agent decisions). Decisions are also hash-anchored on chain via LenderPool.logDecision.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { ROOT } from "./config.js";

export const DATA = process.env.VERCEL ? "/tmp/horos" : resolve(ROOT, "agent/data");
mkdirSync(DATA, { recursive: true });

const jsonl = (file: string) => resolve(DATA, file);
const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

export function recordEvent(e: Record<string, unknown>) {
  appendFileSync(jsonl("events.jsonl"), ser({ at: new Date().toISOString(), ...e }) + "\n");
}

export type Decision = {
  id: string;
  at: string;
  agent: "underwriter" | "monitor" | "treasury";
  subject: string; // seller address or pool
  action: string; // e.g. offer, reject, continue, shrink, freeze, escalate, deploy_idle
  escalated: boolean;
  inputs: unknown;
  output: unknown;
  rationale: string;
  hash: `0x${string}`;
  txHash?: string;
};

export function recordDecision(d: Omit<Decision, "id" | "at" | "hash">): Decision {
  const at = new Date().toISOString();
  const body = { at, ...d };
  const hash = keccak256(toHex(ser(body)));
  const full: Decision = { id: hash.slice(0, 10), hash, ...body };
  appendFileSync(jsonl("decisions.jsonl"), ser(full) + "\n");
  return full;
}

export function patchDecision(hash: string, patch: Partial<Decision>) {
  const all = readJsonl<Decision>("decisions.jsonl").map((d) => (d.hash === hash ? { ...d, ...patch } : d));
  writeFileSync(jsonl("decisions.jsonl"), all.map(ser).join("\n") + "\n");
}

export function readJsonl<T>(file: string): T[] {
  const p = jsonl(file);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function readState<T>(name: string, fallback: T): T {
  const p = jsonl(`${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}

export function writeState(name: string, v: unknown) {
  writeFileSync(jsonl(`${name}.json`), ser(v));
}
