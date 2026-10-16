"use client";
import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { usePoll, usd, short } from "@/lib/api";
import { calls, type LimitsInput } from "@/lib/contracts";
import { signedPost } from "@/lib/signed";
import { pct, type Account, type PoolInfo, type PoolLimits, type Proposal } from "@/lib/types";
import { useWallet } from "@/lib/wallet";
import { NeedsAccount } from "@/components/Connect";
import { TxButton } from "@/components/TxButton";
import { Addr, Panel, Skeleton, StatusChip, type Lien } from "@/components/ui";

export default function Curate() {
  const w = useWallet();
  const { data: acct, error } = usePoll<Account>(w.address ? `/api/accounts/${w.address}` : null, 8000);
  const { data: caps } = usePoll<PoolLimits>("/api/caps", 60000);

  if (w.status !== "ready") return <NeedsAccount what="run a pool" />;
  const mine = acct?.curated.filter((p) => p.version === 2) ?? [];

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Curate a pool</h1>
        <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-white/75">
          A curator decides how much risk a pool takes. You set its limits and risk appetite, approve advances above your auto-approve limit, and
          you alone can mark a default. You cannot move depositors&apos; money: the contract has no withdrawal for curators.
        </p>
      </section>
      {error && !acct && <div className="alert alert-error text-[13px]">Can&apos;t reach the Horos API: {error}</div>}

      {!acct ? (
        <Panel>
          <Skeleton rows={2} />
        </Panel>
      ) : (
        mine.map((p) => <PoolDesk key={p.address} p={p} proposals={p.proposals} caps={caps ?? null} />)
      )}

      <CreatePool caps={caps ?? null} first={!!acct && mine.length === 0} />
    </div>
  );
}

// ---------------------------------------------------------------- a pool you run

function PoolDesk({ p, proposals, caps }: { p: PoolInfo; proposals: Proposal[]; caps: PoolLimits | null }) {
  const { data } = usePoll<{ liens: Lien[] }>(`/api/pools/${p.address}`, 10000);
  const live = data?.liens.filter((l) => l.status === "Active" || l.status === "Frozen") ?? [];
  const [editing, setEditing] = useState(false);
  return (
    <Panel
      title={
        <Link href={`/pools/${p.address}`} className="hover:text-cyan">
          {p.name}
        </Link>
      }
      right={
        <span className="num">
          {usd(p.totalAssetsUsdc, 2)} deposits · {usd(p.liquidityUsdc, 2)} free · takes risk ≤ {p.limits.maxRiskScore}
        </span>
      }
    >
      <h3 className="text-[13px] font-medium text-white/90">Waiting for your approval</h3>
      {proposals.length ? (
        <ul className="mt-2 divide-y divide-line">
          {proposals.map((x) => (
            <ProposalRow key={x.id} pool={p} x={x} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-muted">Nothing waiting. Advances above {usd(p.limits.autoApproveLimitUsdc, 2)} appear here.</p>
      )}

      <h3 className="mt-6 text-[13px] font-medium text-white/90">Live advances</h3>
      {!data ? (
        <Skeleton rows={1} />
      ) : live.length ? (
        <ul className="mt-2 divide-y divide-line">
          {live.map((l) => (
            <DefaultRow key={l.id} pool={p} l={l} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-muted">No live advances.</p>
      )}

      <div className="mt-6 border-t border-line pt-4">
        {editing ? (
          <LimitsForm
            caps={caps}
            initial={p.limits}
            submitLabel="Save limits"
            build={(l) => calls.setLimits(p.address as Address, l)}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
            <span>
              Max advance {usd(p.limits.maxAdvanceUsdc, 2)} · auto-approve ≤ {usd(p.limits.autoApproveLimitUsdc, 2)} · ≤ {pct(p.limits.maxExposureBps)} per seller · sweep{" "}
              {pct(p.limits.minSweepBps)}–{pct(p.limits.maxSweepBps)} · fee ≤ {pct(p.limits.maxFeeBps)} · {p.limits.maxTermDays}d
            </span>
            <button className="text-cyan underline underline-offset-4" onClick={() => setEditing(true)}>
              Edit limits
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ProposalRow({ pool, x }: { pool: PoolInfo; x: Proposal }) {
  const w = useWallet();
  const [reason, setReason] = useState("");
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="num font-medium">{usd(x.amountUsdc, 2)}</span>
        <span className="text-muted">
          to <Addr a={x.seller} /> · fee {pct(x.feeBps)} · sweep {pct(x.sweepBps)} · {x.termDays}d
        </span>
        <Link href={`/seller/${x.seller}`} className="text-[12px] text-cyan underline underline-offset-4">
          Seller record and agent reasoning
        </Link>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <input className="input min-w-[240px] flex-1" placeholder="Your reason (published with the decision)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <TxButton
          className="w-[200px]"
          label="Approve and fund"
          disabled={reason.trim().length < 10}
          build={() => calls.approveProposal(pool.address as Address, x.id)}
          onDone={async (tx) => {
            await signedPost(
              "/api/decisions/human",
              { action: "curate", subject: pool.address, account: w.address!, sign: w.signMessage },
              { pool: pool.address, action: "approve", reason, proposalId: x.id, txHash: tx },
            ).catch(() => {});
          }}
        />
        <TxButton
          className="w-[140px]"
          variant="btn-ghost"
          label="Decline"
          disabled={reason.trim().length < 10}
          build={() => calls.rejectProposal(pool.address as Address, x.id, reason)}
          onDone={async (tx) => {
            await signedPost(
              "/api/decisions/human",
              { action: "curate", subject: pool.address, account: w.address!, sign: w.signMessage },
              { pool: pool.address, action: "reject", reason, proposalId: x.id, txHash: tx },
            ).catch(() => {});
          }}
        />
      </div>
    </li>
  );
}

function DefaultRow({ pool, l }: { pool: PoolInfo; l: Lien }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const owed = Math.max(0, l.repayCapUsdc - l.repaidUsdc);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="font-medium">#{l.id}</span>
        <StatusChip status={l.status} />
        <span className="text-muted">
          seller <span className="mono">{short(l.seller)}</span> · {usd(l.repaidUsdc, 4)} of {usd(l.repayCapUsdc, 2)} repaid
        </span>
        <button className="ml-auto text-[12px] text-danger underline underline-offset-4" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Mark default"}
        </button>
      </div>
      {open && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-3">
          <p className="text-[12px] leading-relaxed text-white/80">
            Marking a default writes off the unpaid principal (up to {usd(Math.min(owed, l.principalUsdc), 4)}), lowers this pool&apos;s share price for
            every depositor, and is permanent on the seller&apos;s public record. Future revenue then goes to the seller.
          </p>
          <textarea className="input mt-2 min-h-[72px] w-full" placeholder="The reason, in full. It is hashed on chain and published." value={reason} onChange={(e) => setReason(e.target.value)} />
          <TxButton
            className="mt-2 max-w-[260px]"
            variant="btn-danger"
            label="Mark default"
            disabled={reason.trim().length < 20}
            build={() => calls.markDefault(pool.address as Address, l.id, reason)}
            onDone={async (tx) => {
              await signedPost(
                "/api/decisions/human",
                { action: "curate", subject: pool.address, account: w.address!, sign: w.signMessage },
                { pool: pool.address, action: "default", reason, lienId: l.id, txHash: tx },
              ).catch(() => {});
              setOpen(false);
            }}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- create

const DEFAULTS: LimitsInput = {
  maxAdvanceUsdc: 5,
  autoApproveLimitUsdc: 2,
  maxExposureBps: 2500,
  minSweepBps: 1000,
  maxSweepBps: 4000,
  maxFeeBps: 1200,
  maxTermDays: 14,
  maxRiskScore: 40,
};

function CreatePool({ caps, first }: { caps: PoolLimits | null; first: boolean }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [open, setOpen] = useState(first);
  const [done, setDone] = useState(false);
  if (!open)
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        Start another pool
      </button>
    );
  return (
    <Panel title="Start a pool" right="you become its curator">
      {done ? (
        <p className="text-[13px] text-success">
          Pool created. It now appears on{" "}
          <Link className="underline underline-offset-4" href="/markets">
            Pools
          </Link>{" "}
          and above. Deposit into it to give it cash to lend.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label className="block">
              <span className="text-[12px] text-muted">Pool name</span>
              <input className="input mt-1 w-full" placeholder="Steady API revenue" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[12px] text-muted">Share symbol</span>
              <input className="input mono mt-1 w-full" placeholder="hSTDY" maxLength={8} value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} />
            </label>
          </div>
          <div className="mt-4">
            <LimitsForm
              caps={caps}
              initial={DEFAULTS}
              submitLabel="Create pool"
              disabled={name.trim().length < 3 || symbol.length < 2}
              build={(l) => calls.createPool(name.trim(), symbol, l)}
              onDone={() => setDone(true)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- limits form

type Field = { k: keyof LimitsInput; label: string; unit: "usd" | "bps" | "days" | "score"; help: string; capKey: keyof PoolLimits; capIsMin?: boolean };
const FIELDS: Field[] = [
  { k: "maxRiskScore", label: "Risk appetite", unit: "score", help: "Highest agent risk score you accept (0 safest, 100 reject).", capKey: "maxRiskScore" },
  { k: "maxAdvanceUsdc", label: "Max advance", unit: "usd", help: "Largest single advance.", capKey: "maxAdvanceUsdc" },
  { k: "autoApproveLimitUsdc", label: "Auto-approve up to", unit: "usd", help: "Above this, you approve by hand.", capKey: "autoApproveLimitUsdc" },
  { k: "maxExposureBps", label: "Max per seller", unit: "bps", help: "Share of the pool one seller can take.", capKey: "maxExposureBps" },
  { k: "minSweepBps", label: "Min sweep", unit: "bps", help: "Smallest share of each payment that repays.", capKey: "minSweepBps", capIsMin: true },
  { k: "maxSweepBps", label: "Max sweep", unit: "bps", help: "Largest share of each payment that repays.", capKey: "maxSweepBps" },
  { k: "maxFeeBps", label: "Max fee", unit: "bps", help: "Flat fee ceiling.", capKey: "maxFeeBps" },
  { k: "maxTermDays", label: "Max term", unit: "days", help: "Longest repayment window.", capKey: "maxTermDays" },
];

const toInput = (f: Field, v: number) => (f.unit === "bps" ? v / 100 : v);
const fromInput = (f: Field, v: number) => (f.unit === "bps" ? Math.round(v * 100) : f.unit === "score" ? Math.round(v) : v);
const fmtCap = (f: Field, v: number) => (f.unit === "usd" ? usd(v, 2) : f.unit === "bps" ? pct(v) : f.unit === "days" ? `${v} days` : String(v));

function LimitsForm({
  caps,
  initial,
  submitLabel,
  build,
  onDone,
  onCancel,
  disabled,
}: {
  caps: PoolLimits | null;
  initial: LimitsInput;
  submitLabel: string;
  build: (l: LimitsInput) => ReturnType<typeof calls.createPool>;
  onDone?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState<LimitsInput>(initial);
  const problems: string[] = [];
  if (caps)
    for (const f of FIELDS) {
      const cap = caps[f.capKey];
      if (f.capIsMin ? v[f.k] < cap : v[f.k] > cap) problems.push(`${f.label} must be ${f.capIsMin ? "at least" : "at most"} ${fmtCap(f, cap)}.`);
    }
  if (v.autoApproveLimitUsdc > v.maxAdvanceUsdc) problems.push("Auto-approve cannot exceed max advance.");
  if (v.minSweepBps > v.maxSweepBps) problems.push("Min sweep cannot exceed max sweep.");
  if (v.maxAdvanceUsdc <= 0 || v.maxExposureBps <= 0 || v.maxTermDays <= 0) problems.push("Max advance, max per seller and term must be above zero.");

  return (
    <div>
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.k} className="block">
            <span className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="text-white/85">{f.label}</span>
              {caps && (
                <span className="text-muted">
                  protocol {f.capIsMin ? "min" : "max"} {fmtCap(f, caps[f.capKey])}
                </span>
              )}
            </span>
            <div className="relative mt-1">
              <input
                className="input num w-full pr-12"
                inputMode="decimal"
                value={toInput(f, v[f.k])}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setV({ ...v, [f.k]: fromInput(f, n) });
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">
                {f.unit === "usd" ? "USDC" : f.unit === "bps" ? "%" : f.unit === "days" ? "days" : "/100"}
              </span>
            </div>
            <span className="mt-1 block text-[11px] text-muted">{f.help}</span>
          </label>
        ))}
      </div>
      {problems.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[12px] text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <TxButton className="w-[220px]" label={submitLabel} disabled={disabled || problems.length > 0} build={() => build(v)} onDone={() => onDone?.()} />
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
