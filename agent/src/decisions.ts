// Agent decisions are published on chain: LenderPool.logDecision(subject, kind, hash, uri) where uri carries a
// compact JSON summary ("yieldline:v1:" + JSON) and hash = keccak of the full local record (inputs + investigation trace).
import { decodeEventLog, type Address } from "viem";
import LenderPool from "./abi/LenderPool.js";
import LienRegistry from "./abi/LienRegistry.js";
import LenderPoolV2 from "./abi/LenderPoolV2.js";
import { isV1, listPools } from "./pools.js";
import { ADDR, EXPLORER } from "./config.js";
import { tx } from "./chain.js";
import { patchDecision, type Decision } from "./store.js";

const PREFIX = "yieldline:v1:";
const LEGACY_PREFIX = "horos:v1:"; // decisions anchored before the rename

export function summarize(d: Decision) {
  const out = (d.output ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (out[k] === undefined ? undefined : out[k]);
  return {
    agent: d.agent,
    action: d.action,
    escalated: d.escalated,
    rationale: d.rationale.slice(0, 1800),
    terms:
      d.agent === "underwriter" || d.agent === "human"
        ? { advanceUsdc: pick("advanceUsdc"), sweepBps: pick("sweepBps"), feeBps: pick("feeBps"), termDays: pick("termDays") }
        : undefined,
    riskScore: pick("riskScore"),
    revenueQuality: pick("revenueQuality"),
    flags: (pick("flags") as string[] | undefined)?.slice(0, 12),
    facts: pick("facts"),
    endpoint: (d.inputs as any)?.endpoint,
    at: d.at,
  };
}

/** Anchor on the pool the decision concerns; pool-agnostic underwriting decisions anchor on Yieldline Core. */
export async function anchorDecision(
  d: Decision,
  who: "underwriter" | "monitor" = d.agent === "underwriter" ? "underwriter" : "monitor",
  pool: Address = (d.pool as Address | undefined) ?? ADDR.core,
) {
  const uri = PREFIX + JSON.stringify(summarize(d));
  if (d.agent === "human") {
    // Human decisions are signed by the pool admin key, not an agent wallet, so they are distinguishable on chain.
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { arcTestnet } = await import("viem/chains");
    const admin = createWalletClient({ account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`), chain: arcTestnet, transport: http() });
    const hash = await admin.writeContract({
      address: pool,
      abi: LenderPool,
      functionName: "logDecision",
      args: [d.subject as Address, `human.${d.action}`, d.hash, uri],
    });
    const { publicClient } = await import("./config.js");
    await publicClient.waitForTransactionReceipt({ hash });
    await patchDecision(d.hash, { txHash: hash });
    return hash;
  }
  const r = await tx.logDecision(pool, who, d.subject as Address, `${d.agent}.${d.action}`, d.hash, uri);
  await patchDecision(d.hash, { txHash: r.txHash });
  return r.txHash;
}

async function getLogs(address: Address) {
  const items: any[] = [];
  let params = "";
  for (let p = 0; p < 30; p++) {
    const r = await fetch(`${EXPLORER}/api/v2/addresses/${address}/logs${params}`);
    if (!r.ok) break;
    const d = await r.json();
    items.push(...(d.items ?? []));
    if (!d.next_page_params) break;
    params = "?" + new URLSearchParams(d.next_page_params).toString();
  }
  return items;
}

function decode(abi: any, log: any) {
  try {
    const ev: any = decodeEventLog({ abi, data: log.data, topics: log.topics.filter(Boolean) });
    return { name: ev.eventName as string, args: ev.args as Record<string, any> };
  } catch {
    return null;
  }
}

const ser = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Full public activity feed: agent decisions + pool and registry events, newest first. */
export async function activity() {
  const pools = await listPools();
  const [regLogs, ...poolLogs] = await Promise.all([getLogs(ADDR.registry), ...pools.map(getLogs)]);
  const rows = [
    ...poolLogs.flatMap((logs, i) => logs.map((l) => ({ l, ev: decode(isV1(pools[i]) ? LenderPool : LenderPoolV2, l), src: "pool", pool: pools[i] }))),
    ...regLogs.map((l) => ({ l, ev: decode(LienRegistry, l), src: "registry" })),
  ]
    .filter((r) => r.ev && !["RoleGranted", "LimitsUpdated", "Transfer", "Approval", "Initialized"].includes(r.ev.name))
    .map(({ l, ev, src, pool }: { l: any; ev: ReturnType<typeof decode>; src: string; pool?: Address }) => {
      let summary: unknown;
      const uri = ev!.name === "Decision" && typeof ev!.args.uri === "string" ? ev!.args.uri : "";
      const prefix = [PREFIX, LEGACY_PREFIX].find((x) => uri.startsWith(x));
      if (prefix) {
        try {
          summary = JSON.parse(uri.slice(prefix.length));
        } catch {}
      }
      return {
        src,
        pool: pool ?? null,
        event: ev!.name,
        args: ser({ ...ev!.args, uri: summary ? undefined : ev!.args.uri }),
        decision: summary,
        block: Number(l.block_number),
        at: l.block_timestamp,
        tx: l.transaction_hash,
        txUrl: `${EXPLORER}/tx/${l.transaction_hash}`,
      };
    });
  return rows.sort((a, b) => b.block - a.block);
}
