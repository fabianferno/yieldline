// Every lending pool Yieldline knows: the v1 operator pilot plus every pool created through the PoolFactory.
import { getAddress, type Address } from "viem";
import LenderPool from "./abi/LenderPool.js";
import LenderPoolV2 from "./abi/LenderPoolV2.js";
import PoolFactory from "./abi/PoolFactory.js";
import { ADDR, publicClient } from "./config.js";
import type { PoolLimits } from "./match.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const u = (x: bigint | number) => Number(x) / 1e6;
const read = <T>(address: Address, abi: any, functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

export type PoolInfo = {
  address: Address;
  version: 1 | 2;
  name: string;
  symbol: string;
  curator: Address;
  openToDeposits: boolean;
  limits: PoolLimits;
  totalAssetsUsdc: number;
  liquidityUsdc: number;
  outstandingPrincipalUsdc: number;
  totalAdvancedUsdc: number;
  totalRepaidUsdc: number;
  feesEarnedUsdc: number;
  writtenOffUsdc: number;
  idleInUsycUsdc: number;
  /** USDC per whole share (v2), null for v1 which has no shares. */
  sharePrice: number | null;
  totalShares: number | null;
  teller: Address | null;
};

export async function listPools(): Promise<Address[]> {
  const v2 = ADDR.factory ? await read<Address[]>(ADDR.factory, PoolFactory, "allPools") : [];
  return [ADDR.pool, ...v2.map((a) => getAddress(a))];
}

export const isV1 = (a: string) => a.toLowerCase() === ADDR.pool.toLowerCase();

async function accounting(addr: Address, abi: any) {
  const [liquidity, outstanding, advanced, repaid, fees, writtenOff, idle, teller] = await Promise.all(
    ["liquidity", "outstandingPrincipal", "totalAdvanced", "totalRepaid", "totalFeesEarned", "totalWrittenOff", "idleDeployed", "teller"].map((f) =>
      read<bigint | Address>(addr, abi, f),
    ),
  );
  return {
    liquidityUsdc: u(liquidity as bigint),
    outstandingPrincipalUsdc: u(outstanding as bigint),
    totalAdvancedUsdc: u(advanced as bigint),
    totalRepaidUsdc: u(repaid as bigint),
    feesEarnedUsdc: u(fees as bigint),
    writtenOffUsdc: u(writtenOff as bigint),
    idleInUsycUsdc: u(idle as bigint),
    teller: teller === ZERO ? null : (teller as Address),
  };
}

export async function readPool(address: Address): Promise<PoolInfo> {
  if (isV1(address)) {
    const [acc, nav, ...lim] = await Promise.all([
      accounting(address, LenderPool),
      read<bigint>(address, LenderPool, "nav"),
      ...["maxAdvance", "autoApproveLimit", "maxExposureBps", "minSweepBps", "maxSweepBps", "maxFeeBps", "maxTerm"].map((f) =>
        read<bigint | number>(address, LenderPool, f),
      ),
    ]);
    return {
      address,
      version: 1,
      name: "Operator pilot (v1)",
      symbol: "—",
      curator: ADDR.admin,
      openToDeposits: false,
      limits: {
        maxAdvanceUsdc: u(lim[0]),
        autoApproveLimitUsdc: u(lim[1]),
        maxExposureBps: Number(lim[2]),
        minSweepBps: Number(lim[3]),
        maxSweepBps: Number(lim[4]),
        maxFeeBps: Number(lim[5]),
        maxTermDays: Number(lim[6]) / 86400,
        maxRiskScore: 100,
      },
      totalAssetsUsdc: u(nav),
      sharePrice: null,
      totalShares: null,
      ...acc,
    };
  }
  const [acc, name, symbol, curator, limits, totalAssets, totalSupply, onePrice] = await Promise.all([
    accounting(address, LenderPoolV2),
    read<string>(address, LenderPoolV2, "name"),
    read<string>(address, LenderPoolV2, "symbol"),
    read<Address>(address, LenderPoolV2, "curator"),
    read<readonly [bigint, bigint, number, number, number, number, bigint, number]>(address, LenderPoolV2, "limits"),
    read<bigint>(address, LenderPoolV2, "totalAssets"),
    read<bigint>(address, LenderPoolV2, "totalSupply"),
    read<bigint>(address, LenderPoolV2, "convertToAssets", [10n ** 12n]),
  ]);
  return {
    address,
    version: 2,
    name,
    symbol,
    curator,
    openToDeposits: true,
    limits: {
      maxAdvanceUsdc: u(limits[0]),
      autoApproveLimitUsdc: u(limits[1]),
      maxExposureBps: Number(limits[2]),
      minSweepBps: Number(limits[3]),
      maxSweepBps: Number(limits[4]),
      maxFeeBps: Number(limits[5]),
      maxTermDays: Number(limits[6]) / 86400,
      maxRiskScore: Number(limits[7]),
    },
    totalAssetsUsdc: u(totalAssets),
    sharePrice: u(onePrice),
    totalShares: Number(totalSupply) / 1e12,
    ...acc,
  };
}

export async function allPoolInfo() {
  return Promise.all((await listPools()).map(readPool));
}

export async function protocolCaps(): Promise<PoolLimits | null> {
  if (!ADDR.factory) return null;
  const c = await read<readonly [bigint, bigint, number, number, number, number, bigint, number]>(ADDR.factory, PoolFactory, "caps");
  return {
    maxAdvanceUsdc: u(c[0]),
    autoApproveLimitUsdc: u(c[1]),
    maxExposureBps: Number(c[2]),
    minSweepBps: Number(c[3]),
    maxSweepBps: Number(c[4]),
    maxFeeBps: Number(c[5]),
    maxTermDays: Number(c[6]) / 86400,
    maxRiskScore: Number(c[7]),
  };
}

/** One account's LP position in a v2 pool. */
export async function position(pool: Address, owner: Address) {
  const [shares, maxWithdraw] = await Promise.all([
    read<bigint>(pool, LenderPoolV2, "balanceOf", [owner]),
    read<bigint>(pool, LenderPoolV2, "maxWithdraw", [owner]),
  ]);
  const value = shares === 0n ? 0n : await read<bigint>(pool, LenderPoolV2, "convertToAssets", [shares]);
  return { pool, shares: Number(shares) / 1e12, valueUsdc: u(value), withdrawableUsdc: u(maxWithdraw) };
}

/** Advances above a pool's auto-approve limit, waiting for the curator. */
export async function pendingProposals(pool: Address) {
  const abi = isV1(pool) ? LenderPool : LenderPoolV2;
  const n = Number(await read<bigint>(pool, abi, "proposalCount"));
  const all = await Promise.all(Array.from({ length: n }, (_, i) => read<readonly unknown[]>(pool, abi, "proposals", [BigInt(i)])));
  return all
    .map((p, id) => {
      const executed = Boolean(p[p.length - 1]);
      return {
        id,
        seller: p[0] as Address,
        amountUsdc: u(p[1] as bigint),
        feeBps: Number(p[2]),
        sweepBps: Number(p[3]),
        termDays: Number(p[4]) / 86400,
        decisionHash: p[p.length - 2] as string,
        executed,
      };
    })
    .filter((p) => !p.executed);
}

export async function splitterIn(pool: Address, seller: Address) {
  const s = await read<Address>(pool, isV1(pool) ? LenderPool : LenderPoolV2, "splitterOf", [seller]);
  return s === ZERO ? null : s;
}
