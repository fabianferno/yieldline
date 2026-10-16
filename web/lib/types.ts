// Shapes returned by the Horos API (agent/src/productApi.ts).
import type { Lien } from "@/components/ui";

export type PoolLimits = {
  maxAdvanceUsdc: number;
  autoApproveLimitUsdc: number;
  maxExposureBps: number;
  minSweepBps: number;
  maxSweepBps: number;
  maxFeeBps: number;
  maxTermDays: number;
  maxRiskScore: number;
};

export type PoolInfo = {
  address: string;
  version: 1 | 2;
  name: string;
  symbol: string;
  curator: string;
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
  sharePrice: number | null;
  totalShares: number | null;
  teller: string | null;
  liveLiens?: number;
  liensTotal?: number;
};

export type Proposal = { id: number; seller: string; amountUsdc: number; feeBps: number; sweepBps: number; termDays: number; decisionHash: string };

export type Offer = {
  id: string;
  seller: string;
  endpoint: string;
  applicant?: string;
  status: "underwriting" | "failed" | "offered" | "accepted" | "funded" | "rejected" | "pending_human";
  decision: "offer" | "reject" | "escalate";
  advanceUsdc: number;
  sweepBps: number;
  feeBps: number;
  termDays: number;
  riskScore: number;
  revenueQuality: string;
  flags: string[];
  rationale: string;
  conditions: string[];
  decisionHash: string;
  createdAt: string;
  trace?: { tool: string; at: string; summary: string }[];
  error?: string;
  pool?: string;
  splitter?: string;
  lienId?: number;
  proposalId?: number;
  txs?: Record<string, string>;
};

export type PoolMatch = { pool: string; name: string; eligible: boolean; reasons: string[]; needsCuratorApproval: boolean; liquidityUsdc: number };

export type LienInfo = {
  seller: string;
  encumbered: boolean;
  liveLienId: number;
  outstandingUsdc: number;
  record: { opened: number; repaid: number; defaulted: number; frozenEvents: number };
  splitter: string | null;
  pool: string | null;
  liens: (Lien & { lender: string })[];
};

export type Account = {
  offers: Offer[];
  liens: LienInfo[];
  positions: { pool: string; name?: string; shares: number; valueUsdc: number; withdrawableUsdc: number }[];
  curated: (PoolInfo & { proposals: Proposal[] })[];
};

export const pct = (bps: number) => `${+(bps / 100).toFixed(2)}%`;
