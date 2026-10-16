// Key-value storage: Upstash Redis when configured (Vercel), JSON files under agent/data otherwise (local CLI).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Redis } from "@upstash/redis";
import { ROOT } from "./config.js";

export const DATA = process.env.VERCEL ? "/tmp/horos" : resolve(ROOT, "agent/data");
mkdirSync(DATA, { recursive: true });

const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

export type KV = {
  backend: "redis" | "files";
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, v: unknown, opts?: { exSec?: number; nx?: boolean }): Promise<boolean>;
  hget<T>(hash: string, field: string): Promise<T | null>;
  hset(hash: string, field: string, v: unknown): Promise<void>;
  hvals<T>(hash: string): Promise<T[]>;
  /** Increment a counter; the expiry is set when the counter is created. */
  incr(key: string, exSec: number): Promise<number>;
};

function redisKV(url: string, token: string): KV {
  const r = new Redis({ url, token, automaticDeserialization: false });
  const parse = <T>(s: unknown): T | null => (s === null || s === undefined ? null : (JSON.parse(String(s)) as T));
  const ns = (k: string) => `horos:${k}`;
  return {
    backend: "redis",
    get: async (k) => parse(await r.get(ns(k))),
    set: async (k, v, o = {}) => {
      const opts: any = {};
      if (o.exSec) opts.ex = o.exSec;
      if (o.nx) opts.nx = true;
      const res = await r.set(ns(k), ser(v), opts);
      return res === "OK";
    },
    hget: async (h, f) => parse(await r.hget(ns(h), f)),
    hset: async (h, f, v) => {
      await r.hset(ns(h), { [f]: ser(v) });
    },
    hvals: async (h) => ((await r.hvals(ns(h))) as unknown[]).map((s) => parse(s)!),
    incr: async (k, exSec) => {
      const n = await r.incr(ns(k));
      if (n === 1) await r.expire(ns(k), exSec);
      return n;
    },
  };
}

function fileKV(): KV {
  const path = (k: string) => resolve(DATA, `${k.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  const load = <T>(k: string): T | null => (existsSync(path(k)) ? (JSON.parse(readFileSync(path(k), "utf8")) as T) : null);
  const save = (k: string, v: unknown) => writeFileSync(path(k), ser(v));
  type Expiring = { v: unknown; exp?: number };
  const live = (e: Expiring | null) => e && (!e.exp || e.exp > Date.now());
  return {
    backend: "files",
    get: async <T>(k: string) => load<T>(k),
    set: async (k, v, o = {}) => {
      if (o.exSec || o.nx) {
        const cur = load<Expiring>(`x-${k}`);
        if (o.nx && live(cur)) return false;
        save(`x-${k}`, { v, exp: o.exSec ? Date.now() + o.exSec * 1000 : undefined });
        return true;
      }
      save(k, v);
      return true;
    },
    hget: async <T>(h: string, f: string) => (load<Record<string, T>>(`h-${h}`) ?? {})[f] ?? null,
    hset: async (h, f, v) => {
      const m = load<Record<string, unknown>>(`h-${h}`) ?? {};
      m[f] = v;
      save(`h-${h}`, m);
    },
    hvals: async <T>(h: string) => Object.values(load<Record<string, T>>(`h-${h}`) ?? {}),
    incr: async (k, exSec) => {
      const cur = load<Expiring>(`x-${k}`);
      const n = (live(cur) ? Number(cur!.v) : 0) + 1;
      save(`x-${k}`, { v: n, exp: live(cur) ? cur!.exp : Date.now() + exSec * 1000 });
      return n;
    },
  };
}

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
export const kv: KV = url && token ? redisKV(url, token) : fileKV();
