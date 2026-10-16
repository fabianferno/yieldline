// On-chain reads + agent writes. Agent writes go through Circle developer-controlled wallets.
import type { Address } from "viem";
import LienRegistry from "./abi/LienRegistry.js";
import LenderPool from "./abi/LenderPool.js";
import RevenueSplitter from "./abi/RevenueSplitter.js";
import { ADDR, circleWallet, publicClient } from "./config.js";
// Loaded lazily: the hosted read/x402 API never writes, and this keeps the Circle SDK out of its cold path.
const circleExecute = async (opts: Parameters<typeof import("./circle.js").circleExecute>[0]) =>
  (await import("./circle.js")).circleExecute(opts);

const STATUS = ["None", "Active", "Frozen", "Repaid", "Defaulted"] as const;
const read = <T>(address: Address, abi: any, functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

export async function poolState() {
  const [liquidity, nav, outstanding, advanced, repaid, fees, writtenOff, idle] = await Promise.all(
    ["liquidity", "nav", "outstandingPrincipal", "totalAdvanced", "totalRepaid", "totalFeesEarned", "totalWrittenOff", "idleDeployed"].map(
      (f) => read<bigint>(ADDR.pool, LenderPool, f),
    ),
  );
  const [maxAdvance, autoApproveLimit, maxExposureBps, minSweepBps, maxSweepBps, maxFeeBps, maxTerm] = await Promise.all(
    ["maxAdvance", "autoApproveLimit", "maxExposureBps", "minSweepBps", "maxSweepBps", "maxFeeBps", "maxTerm"].map((f) =>
      read<bigint | number>(ADDR.pool, LenderPool, f),
    ),
  );
  const u = (x: bigint | number) => Number(x) / 1e6;
  return {
    liquidityUsdc: u(liquidity),
    navUsdc: u(nav),
    outstandingPrincipalUsdc: u(outstanding),
    totalAdvancedUsdc: u(advanced),
    totalRepaidUsdc: u(repaid),
    feesEarnedUsdc: u(fees),
    writtenOffUsdc: u(writtenOff),
    idleInUsycUsdc: u(idle),
    limits: {
      maxAdvanceUsdc: u(maxAdvance),
      autoApproveLimitUsdc: u(autoApproveLimit),
      maxExposureBps: Number(maxExposureBps),
      minSweepBps: Number(minSweepBps),
      maxSweepBps: Number(maxSweepBps),
      maxFeeBps: Number(maxFeeBps),
      maxTermDays: Number(maxTerm) / 86400,
    },
  };
}

export async function lienInfo(seller: Address) {
  const [[total, liveLienId], record, ids] = await Promise.all([
    read<[bigint, bigint]>(ADDR.registry, LienRegistry, "encumbrance", [seller]),
    read<[number, number, number, number]>(ADDR.registry, LienRegistry, "recordOf", [seller]),
    read<bigint[]>(ADDR.registry, LienRegistry, "liensOf", [seller]),
  ]);
  const liens = await Promise.all(ids.map((id) => lien(id)));
  const live = liens.find((l) => l.id === Number(liveLienId));
  return {
    seller,
    encumbered: liveLienId !== 0n,
    liveLienId: Number(liveLienId),
    outstandingUsdc: Number(total) / 1e6,
    record: { opened: record[0], repaid: record[1], defaulted: record[2], frozenEvents: record[3] },
    splitter: live?.payTo ?? null,
    pool: live?.lender ?? null,
    liens,
  };
}

export async function lien(id: bigint | number) {
  const l = await read<any>(ADDR.registry, LienRegistry, "lien", [BigInt(id)]);
  return {
    id: Number(id),
    seller: l.seller as Address,
    payTo: l.payTo as Address,
    lender: l.lender as Address,
    principalUsdc: Number(l.principal) / 1e6,
    repayCapUsdc: Number(l.repayCap) / 1e6,
    repaidUsdc: Number(l.repaid) / 1e6,
    sweepBps: Number(l.sweepBps),
    status: STATUS[Number(l.status)],
    createdAt: Number(l.createdAt),
    termEnd: Number(l.termEnd),
  };
}

export async function allLiens() {
  const n = Number(await read<bigint>(ADDR.registry, LienRegistry, "lienCount"));
  return Promise.all(Array.from({ length: n }, (_, i) => lien(i + 1)));
}

export async function splitterStats(splitter: Address) {
  const [received, swept, forwarded, owed, sweepBps, accelerated] = await Promise.all(
    ["totalReceived", "totalSwept", "totalForwarded", "owed", "sweepBps", "accelerated"].map((f) =>
      read<bigint | number | boolean>(splitter, RevenueSplitter, f),
    ),
  );
  return {
    receivedUsdc: Number(received) / 1e6,
    sweptUsdc: Number(swept) / 1e6,
    forwardedUsdc: Number(forwarded) / 1e6,
    owedUsdc: Number(owed) / 1e6,
    sweepBps: Number(sweepBps),
    accelerated: Boolean(accelerated),
  };
}

// ------------------------------------------------------------- writes (Circle wallets)

const agentWallet = (who: "underwriter" | "monitor") =>
  circleWallet(who === "underwriter" ? "underwriting-agent" : "monitor-agent").id;

export const tx = {
  ensureSplitter: (pool: Address, seller: Address) =>
    circleExecute({
      walletId: agentWallet("underwriter"),
      contractAddress: pool,
      abiFunctionSignature: "ensureSplitter(address)",
      abiParameters: [seller],
    }),
  /** v1 pool (operator pilot): no risk-score argument. */
  advanceV1: (seller: Address, amount: bigint, feeBps: number, sweepBps: number, termSec: number, decisionHash: string) =>
    circleExecute({
      walletId: agentWallet("underwriter"),
      contractAddress: ADDR.pool,
      abiFunctionSignature: "advance(address,uint128,uint16,uint16,uint64,bytes32)",
      abiParameters: [seller, amount.toString(), feeBps, sweepBps, termSec, decisionHash],
    }),
  advance: (pool: Address, seller: Address, amount: bigint, feeBps: number, sweepBps: number, termSec: number, riskScore: number, decisionHash: string) =>
    circleExecute({
      walletId: agentWallet("underwriter"),
      contractAddress: pool,
      abiFunctionSignature: "advance(address,uint128,uint16,uint16,uint64,uint8,bytes32)",
      abiParameters: [seller, amount.toString(), feeBps, sweepBps, termSec, riskScore, decisionHash],
    }),
  logDecision: (pool: Address, who: "underwriter" | "monitor", subject: Address, kind: string, hash: string, uri: string) =>
    circleExecute({
      walletId: agentWallet(who),
      contractAddress: pool,
      abiFunctionSignature: "logDecision(address,string,bytes32,string)",
      abiParameters: [subject, kind, hash, uri],
    }),
  freeze: (pool: Address, lienId: number, reasonHash: string) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: pool,
      abiFunctionSignature: "freeze(uint256,bytes32)",
      abiParameters: [lienId, reasonHash],
    }),
  unfreeze: (pool: Address, lienId: number, reasonHash: string) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: pool,
      abiFunctionSignature: "unfreeze(uint256,bytes32)",
      abiParameters: [lienId, reasonHash],
    }),
  setSweep: (pool: Address, lienId: number, sweepBps: number, hash: string) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: pool,
      abiFunctionSignature: "setSweep(uint256,uint16,bytes32)",
      abiParameters: [lienId, sweepBps, hash],
    }),
  split: (splitter: Address) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: splitter,
      abiFunctionSignature: "split()",
      abiParameters: [],
    }),
  deployIdle: (pool: Address, assets: bigint, hash: string) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: pool,
      abiFunctionSignature: "deployIdle(uint256,bytes32)",
      abiParameters: [assets.toString(), hash],
    }),
  recallIdle: (pool: Address, shares: bigint, hash: string) =>
    circleExecute({
      walletId: agentWallet("monitor"),
      contractAddress: pool,
      abiFunctionSignature: "recallIdle(uint256,bytes32)",
      abiParameters: [shares.toString(), hash],
    }),
};

/** Fetch a seller's live x402 challenge (unpaid request) and return what it asks buyers to pay. */
export async function probe402(url: string) {
  // No redirects (the URL was checked, its redirect target was not) and a hard timeout.
  const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  const hdr = r.headers.get("PAYMENT-REQUIRED");
  if (r.status !== 402 || !hdr) return { url, status: r.status, ok: false as const, error: "no x402 challenge" };
  const pr = JSON.parse(Buffer.from(hdr, "base64").toString("utf8"));
  const a = pr.accepts?.[0] ?? {};
  return {
    url,
    status: 402,
    ok: true as const,
    payTo: String(a.payTo).toLowerCase() as Address,
    network: a.network as string,
    amount: a.amount as string,
    asset: a.asset as string,
  };
}
