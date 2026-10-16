// Addresses, ABI fragments for the calls the browser signs, and plain-language revert messages.
import { BaseError, ContractFunctionRevertedError, encodeFunctionData, erc20Abi, keccak256, parseAbi, toHex, type Address } from "viem";
import type { Call } from "./wallet";

export const ADDR = {
  usdc: "0x3600000000000000000000000000000000000000" as Address,
  registry: "0xD140eED8f20B2157366B36FcC08226d64c16906F" as Address,
  poolV1: "0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506" as Address,
  factory: "0x99Fccc04f51284b9CDe6D3f793CC3430392e039C" as Address,
  core: "0xbb0Defa2dDa7a205FF9f7F9E016097E4Dfe5067e" as Address,
};

export const poolAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
  "function approveProposal(uint256 pid) returns (uint256)",
  "function rejectProposal(uint256 pid, bytes32 reasonHash)",
  "error NotLiveLien()",
  "function markDefault(uint256 lienId, bytes32 reasonHash)",
  "function setLimits((uint128,uint128,uint16,uint16,uint16,uint16,uint64,uint8) l)",
  "error LimitExceeded(string which)",
  "error InsufficientLiquidity()",
  "error AlreadyExecuted()",
  "error ERC4626ExceededMaxWithdraw(address owner, uint256 assets, uint256 max)",
  "error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error CapExceeded(string which)",
]);

export const factoryAbi = parseAbi([
  "function createPool(string name, string symbol, (uint128,uint128,uint16,uint16,uint16,uint16,uint64,uint8) l) returns (address)",
  "event PoolCreated(address indexed pool, address indexed curator, string name, string symbol)",
  "error CapExceeded(string which)",
]);

export type LimitsInput = {
  maxAdvanceUsdc: number;
  autoApproveLimitUsdc: number;
  maxExposureBps: number;
  minSweepBps: number;
  maxSweepBps: number;
  maxFeeBps: number;
  maxTermDays: number;
  maxRiskScore: number;
};

const units = (n: number) => BigInt(Math.round(n * 1e6));
export const limitsTuple = (l: LimitsInput) =>
  [units(l.maxAdvanceUsdc), units(l.autoApproveLimitUsdc), l.maxExposureBps, l.minSweepBps, l.maxSweepBps, l.maxFeeBps, BigInt(Math.round(l.maxTermDays * 86400)), l.maxRiskScore] as const;

export const calls = {
  deposit: (pool: Address, usdc: number, me: Address): Call[] => [
    { to: ADDR.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pool, units(usdc)] }) },
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "deposit", args: [units(usdc), me] }) },
  ],
  withdraw: (pool: Address, usdc: number, me: Address): Call[] => [
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "withdraw", args: [units(usdc), me, me] }) },
  ],
  approveProposal: (pool: Address, pid: number): Call[] => [
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "approveProposal", args: [BigInt(pid)] }) },
  ],
  rejectProposal: (pool: Address, pid: number, reason: string): Call[] => [
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "rejectProposal", args: [BigInt(pid), keccak256(toHex(reason))] }) },
  ],
  markDefault: (pool: Address, lienId: number, reason: string): Call[] => [
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "markDefault", args: [BigInt(lienId), keccak256(toHex(reason))] }) },
  ],
  setLimits: (pool: Address, l: LimitsInput): Call[] => [
    { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "setLimits", args: [limitsTuple(l)] }) },
  ],
  createPool: (name: string, symbol: string, l: LimitsInput): Call[] => [
    { to: ADDR.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "createPool", args: [name, symbol, limitsTuple(l)] }) },
  ],
};

const LIMIT_TEXT: Record<string, string> = {
  maxAdvance: "The amount is above this pool's max advance.",
  autoApprove: "Auto-approve limit must be within the protocol cap and no larger than max advance.",
  exposure: "One seller would exceed this pool's exposure limit.",
  sweepBounds: "Sweep is outside the allowed range.",
  maxFee: "Fee is above the cap.",
  maxTerm: "Term is longer than allowed.",
  riskScore: "Risk appetite is above the protocol cap.",
  riskAppetite: "The seller's risk score is above this pool's appetite.",
  encumbered: "This seller already has a live lien.",
};

/** Turn a revert into a sentence a person can act on. */
export function explainError(e: unknown): string {
  const msg = (e as any)?.shortMessage ?? (e as any)?.message ?? String(e);
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName;
    const arg = rev?.data?.args?.[0] as string | undefined;
    if ((name === "LimitExceeded" || name === "CapExceeded") && arg) return LIMIT_TEXT[arg] ?? `Limit exceeded: ${arg}.`;
    if (name === "InsufficientLiquidity") return "The pool does not have enough free cash right now.";
    if (name?.startsWith("ERC4626ExceededMax")) return "That is more than you can withdraw right now: the rest is lent out and returns as sweeps arrive.";
    if (name === "AccessControlUnauthorizedAccount") return "This account is not allowed to do that (curator only).";
    if (name === "AlreadyExecuted") return "That proposal was already decided.";
    if (name === "NotLiveLien") return "That lien is closed or belongs to another pool.";
  }
  if (/NotAllowedError|not allowed|denied|cancel/i.test(msg)) return "The passkey prompt was dismissed.";
  if (/insufficient|exceeds balance|transfer amount/i.test(msg)) return "Not enough USDC in your account for this (and its gas).";
  return msg.split("\n")[0];
}
