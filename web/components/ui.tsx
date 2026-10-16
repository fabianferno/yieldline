"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE, Num, useGrowth } from "./motion";
import { EXPLORER, ago, short, usd } from "@/lib/api";
import { IBolt, ICheck, IChart, ICube, IExternal, IInfo, IUp, IWarn, IX } from "./icons";

export function Panel({
  title,
  right,
  children,
  className = "",
  id,
}: {
  id?: string;
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`panel p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="panel-title">{title}</h2>}
          {right && <div className="text-[12px] text-muted">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A label/value pair laid out for scanning, not a card. */
export function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "cyan" | "amber" | "danger" }) {
  const c = tone === "cyan" ? "text-cyan" : tone === "amber" ? "text-amber" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num mt-1 text-[22px] font-semibold leading-tight tracking-tight ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-white/70">{sub}</div>}
    </div>
  );
}

const STATUS: Record<string, string> = {
  Active: "text-cyan border-cyan/40",
  Frozen: "text-danger border-danger/50",
  Repaid: "text-success border-success/40",
  Defaulted: "text-danger border-danger/60",
};
export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS[status] ?? "text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "Active" ? "pulse" : ""}`} />
      {status}
    </span>
  );
}

export function Addr({ a, href }: { a?: string | null; href?: string }) {
  if (!a) return <span className="text-muted">—</span>;
  return (
    <a className="mono text-[12px] text-ice/90 underline decoration-line underline-offset-4 hover:text-cyan" href={href ?? `${EXPLORER}/address/${a}`} target="_blank">
      {short(a)}
    </a>
  );
}

export type Lien = {
  id: number;
  seller: string;
  payTo: string;
  principalUsdc: number;
  repayCapUsdc: number;
  repaidUsdc: number;
  sweepBps: number;
  status: string;
  createdAt: number;
  termEnd: number;
  lender?: string;
  splitter?: { receivedUsdc: number; sweptUsdc: number; forwardedUsdc: number; owedUsdc: number; accelerated: boolean };
};

function termLeft(l: Lien) {
  const s = l.termEnd - Date.now() / 1000;
  if (s <= 0) return "term ended";
  const d = s / 86400;
  return d >= 1 ? `${d.toFixed(1)} days left` : `${Math.ceil(s / 3600)}h left`;
}

/** The lien as the page's main object: what is owed, how fast it is coming back, and where every payment goes. */
export function LienCard({ l, sellerLink = true }: { l: Lien; sellerLink?: boolean }) {
  const pct = Math.min(100, (l.repaidUsdc / (l.repayCapUsdc || 1)) * 100);
  const sweep = l.splitter?.accelerated ? 100 : l.sweepBps / 100;
  const frozen = l.status === "Frozen";
  const sweeps = useGrowth(l.repaidUsdc);
  const m4 = (n: number) => usd(n, 4);
  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-[18px] font-semibold tracking-tight">Advance #{l.id}</h3>
        <StatusChip status={l.status} />
        <span className="text-[12px] text-muted">
          {sellerLink ? (
            <>
              seller{" "}
              <Link href={`/seller/${l.seller}`} className="mono text-ice underline decoration-line underline-offset-4 hover:text-cyan">
                {short(l.seller)}
              </Link>{" "}
              ·{" "}
            </>
          ) : null}
          opened {ago(new Date(l.createdAt * 1000).toISOString())} · {termLeft(l)}
          {l.lender && (
            <>
              {" "}· held by{" "}
              <Link href={`/pools/${l.lender}`} className="mono text-ice underline decoration-line underline-offset-4 hover:text-cyan">
                pool {short(l.lender)}
              </Link>
            </>
          )}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Metric label="Advanced" value={usd(l.principalUsdc, 2)} />
        <Metric label="Repaid" value={<Num value={l.repaidUsdc} format={m4} />} tone="cyan" sub={`${pct.toFixed(1)}% of ${usd(l.repayCapUsdc, 2)} cap`} />
        <Metric label="Still owed" value={<Num value={Math.max(0, l.repayCapUsdc - l.repaidUsdc)} format={m4} />} />
        {l.splitter ? (
          <Metric label="Revenue routed" value={<Num value={l.splitter.receivedUsdc} format={m4} />} sub="through the splitter" />
        ) : (
          <Metric label="Term" value={termLeft(l)} sub={`${(l.sweepBps / 100).toFixed(0)}% of revenue swept`} />
        )}
      </div>

      <div className="mt-5">
        <div className="track !h-2">
          <Bar pct={pct} danger={frozen} />
        </div>
      </div>

      {/* Where one incoming payment goes */}
      <div className="mt-5 rounded-xl border border-line bg-midnight/40 p-3.5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
          <span className="text-white/85">Every x402 payment to this seller splits on arrival</span>
          <span className="text-muted">
            payTo → splitter <Addr a={l.payTo} />
          </span>
        </div>
        <div className="flex h-7 overflow-hidden rounded-md text-[11px] font-medium">
          <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-r from-cyan to-cyan-deep text-midnight" style={{ width: `${sweep}%` }}>
            {sweeps > 0 && <span key={sweeps} className="sweep-run" />}
            <span className="relative">{sweep}% to pool</span>
          </div>
          {sweep < 100 && (
            <div className="flex flex-1 items-center justify-center bg-glass text-white/85">{100 - sweep}% to seller</div>
          )}
        </div>
        {l.splitter && <div className="mt-2 flex justify-between text-[12px] text-muted">
          <span>
            swept <span className="num text-white/85"><Num value={l.splitter.sweptUsdc} format={m4} /></span>
          </span>
          <span>
            forwarded <span className="num text-white/85"><Num value={l.splitter.forwardedUsdc} format={m4} /></span>
          </span>
        </div>}
        {l.splitter?.accelerated && <p className="mt-2 text-[12px] text-danger">Frozen by the monitor: sweeping 100% until the seller restores payTo.</p>}
      </div>
    </article>
  );
}

/** Progress fill grown with a transform, so it never forces layout. */
export function Bar({ pct, danger }: { pct: number; danger?: boolean }) {
  return (
    <motion.div
      className={`${danger ? "fill-danger" : "fill-cyan"} origin-left`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.max(pct, 1) / 100 }}
      transition={{ duration: 0.9, ease: EASE }}
    />
  );
}

/** Compact row for past advances. */
export function LienRow({ l }: { l: Lien }) {
  const pct = Math.min(100, (l.repaidUsdc / (l.repayCapUsdc || 1)) * 100);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold">#{l.id}</span>
        <StatusChip status={l.status} />
      </div>
      <div>
        <div className="track">
          <Bar pct={pct} danger={l.status === "Frozen"} />
        </div>
        <div className="mt-1 text-[12px] text-muted">
          <span className="num text-white/85">{usd(l.repaidUsdc, 4)}</span> of {usd(l.repayCapUsdc, 2)} · sweep {(l.sweepBps / 100).toFixed(0)}% · {termLeft(l)}
        </div>
      </div>
      <div className="num text-right text-[15px] font-semibold">{usd(l.principalUsdc, 2)}</div>
    </div>
  );
}

export type FeedItem = {
  src: string;
  event: string;
  args: Record<string, any>;
  decision?: {
    agent: string;
    action: string;
    escalated: boolean;
    rationale: string;
    terms?: { advanceUsdc?: number; sweepBps?: number; feeBps?: number; termDays?: number };
    riskScore?: number;
    revenueQuality?: string;
    flags?: string[];
    endpoint?: string;
    at: string;
  };
  at: string;
  tx: string;
  txUrl: string;
};

type Kind = "success" | "warning" | "error" | "info";
const ACTION_KIND: Record<string, Kind> = {
  offer: "success",
  fund: "success",
  unfreeze: "success",
  continue: "info",
  deploy_idle: "info",
  recall_idle: "info",
  hold: "warning",
  escalate: "warning",
  adjust_sweep: "warning",
  override_pilot: "warning",
  human_approved: "warning",
  reject: "error",
  freeze: "error",
  escalate_default: "error",
};
const KIND_ICON = { success: ICheck, warning: IWarn, error: IX, info: IInfo };
const KIND_TEXT = { success: "text-success", warning: "text-amber", error: "text-danger", info: "text-info" };
const KIND_RING = { success: "border-success/40 bg-success/10", warning: "border-amber/40 bg-amber/10", error: "border-danger/40 bg-danger/10", info: "border-info/40 bg-info/10" };

export const agentName = (a: string) => (a === "human" ? "Operator" : `${a[0].toUpperCase()}${a.slice(1)}`);

/** One entry in the decision log: verdict first, terms next, reasoning on demand. */
export function DecisionEntry({ f }: { f: FeedItem }) {
  const d = f.decision!;
  const [open, setOpen] = useState(false);
  const kind = ACTION_KIND[d.action] ?? "info";
  const Icon = KIND_ICON[kind];
  const long = d.rationale.length > 180;
  const terms = d.terms?.advanceUsdc
    ? [
        `${usd(d.terms.advanceUsdc, 2)} advance`,
        `${((d.terms.sweepBps ?? 0) / 100).toFixed(0)}% sweep`,
        `${((d.terms.feeBps ?? 0) / 100).toFixed(1)}% fee`,
        `${d.terms.termDays}d`,
      ]
    : [];
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.35, ease: EASE }}
      className="relative grid grid-cols-[32px_1fr] gap-3 py-4"
    >
      <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border ${KIND_RING[kind]} ${KIND_TEXT[kind]}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`text-[14px] font-semibold capitalize ${KIND_TEXT[kind]}`}>{d.action.replaceAll("_", " ")}</span>
          <span className="text-[12px] text-white/70">{agentName(d.agent)}</span>
          {d.agent !== "treasury" && f.args.subject && (
            <Link href={`/seller/${f.args.subject}`} className="mono text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-cyan">
              {short(f.args.subject)}
            </Link>
          )}
          {d.escalated && <span className="chip !h-5 border-amber/40 text-amber">needs a human</span>}
          <a href={f.txUrl} target="_blank" className="ml-auto text-[12px] text-muted hover:text-cyan" title="Anchored on Arc">
            {ago(f.at)} <IExternal size={11} className="inline -mt-0.5" />
          </a>
        </div>
        {(terms.length > 0 || d.riskScore !== undefined) && (
          <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-white/85">
            {terms.map((t) => (
              <span key={t}>{t}</span>
            ))}
            {d.riskScore !== undefined && <span className="text-amber">risk {d.riskScore}/100</span>}
            {!terms.length && d.revenueQuality && <span className="text-muted">revenue {d.revenueQuality}</span>}
          </div>
        )}
        <p className={`mt-1.5 max-w-[72ch] text-[13px] leading-relaxed text-white/72 ${open ? "" : "line-clamp-2"}`}>{d.rationale}</p>
        {long && (
          <button onClick={() => setOpen(!open)} className="mt-1 text-[12px] font-medium text-cyan hover:underline">
            {open ? "Show less" : "Full reasoning"}
          </button>
        )}
        <AnimatePresence initial={false}>
          {open && d.flags && d.flags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 pt-2">
                {d.flags.map((x) => (
                  <span key={x} className="mono rounded-md border border-line bg-midnight/60 px-1.5 py-0.5 text-[11px] text-muted">
                    {x}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

const ST = ["None", "Active", "Frozen", "Repaid", "Defaulted"];
const EVENT_TEXT: Record<string, (a: any) => [string, React.ReactNode]> = {
  LienOpened: (a) => [`Advance #${a.lienId} opened · ${usd(Number(a.principal) / 1e6, 2)} principal, cap ${usd(Number(a.repayCap) / 1e6, 4)}`, <ICube key="i" size={15} />],
  LienRepayment: (a) => [`Repaid to pool · ${usd(Number(a.amount) / 1e6, 4)} on advance #${a.lienId}`, <IUp key="i" size={15} />],
  LienStatusChanged: (a) => [`Advance #${a.lienId} ${ST[Number(a.from)]} → ${ST[Number(a.to)]}`, <IWarn key="i" size={15} />],
  AdvanceDisbursed: (a) => [`Disbursed ${usd(Number(a.amount) / 1e6, 2)} USDC to ${short(a.seller)}`, <IBolt key="i" size={15} />],
  SplitterCreated: (a) => [`Splitter ${short(a.splitter)} deployed for ${short(a.seller)}`, <ICube key="i" size={15} />],
  IdleDeployed: (a) => [`Parked ${usd(Number(a.assets) / 1e6, 2)} in USYC`, <IChart key="i" size={15} />],
  IdleRecalled: (a) => [`Recalled ${usd(Number(a.assets) / 1e6, 2)} from USYC`, <IChart key="i" size={15} />],
  AdvanceProposed: (a) => [`Advance of ${usd(Number(a.amount) / 1e6, 2)} queued for human approval`, <IWarn key="i" size={15} />],
};

/** On-chain events, with runs of sweeps folded into a single line so the rarer events stay visible. */
export function ActivityList({ items, max = 14 }: { items: FeedItem[]; max?: number }) {
  type Row = { key: string; text: string; icon: React.ReactNode; at: string; href: string; count?: number };
  const rows: Row[] = [];
  for (const f of items) {
    const e = EVENT_TEXT[f.event]?.(f.args);
    if (!e) continue;
    const prev = rows[rows.length - 1];
    if (f.event === "LienRepayment" && prev?.count) {
      prev.count++;
      (prev as any).sum += Number(f.args.amount) / 1e6;
      prev.text = `${prev.count} repayments to pool · ${usd((prev as any).sum, 4)} on advance #${f.args.lienId}`;
      (prev as any).last = f.at;
      continue;
    }
    const row: any = { key: f.tx + f.event + (f.args?.amount ?? ""), text: e[0], icon: e[1], at: f.at, href: f.txUrl };
    if (f.event === "LienRepayment") {
      row.count = 1;
      row.sum = Number(f.args.amount) / 1e6;
    }
    rows.push(row);
  }
  if (!rows.length) return <p className="text-[13px] text-muted">No on-chain events yet. The first advance will appear here.</p>;
  return (
    <ol>
      <AnimatePresence initial={false}>
      {rows.slice(0, max).map((r: any) => (
        <motion.li
          key={r.key}
          layout="position"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-glass/60 ${r.count ? "text-cyan" : "text-amber"}`}>{r.icon}</span>
          <span className="min-w-0 flex-1 text-[13px] text-white/85">
            {r.text}
            {r.count > 1 && <span className="block text-[11px] text-muted">{ago(r.last)} → {ago(r.at)}</span>}
          </span>
          <a href={r.href} target="_blank" className="shrink-0 text-[12px] text-muted hover:text-cyan">
            {ago(r.at)}
          </a>
        </motion.li>
      ))}
      </AnimatePresence>
    </ol>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={`tab relative ${o.value === value ? "active" : ""}`}>
          {o.value === value && (
            <motion.span layoutId={`tab-${options.map((x) => x.value).join("-")}`} className="tab-pill edge glow-cyan" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
          )}
          <span className="relative z-[2]">
            {o.label}
            {o.count !== undefined && <span className="num ml-1.5 text-[11px] opacity-60">{o.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-glass/70" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
