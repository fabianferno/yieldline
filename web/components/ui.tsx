"use client";
import Link from "next/link";
import { useState } from "react";
import { EXPLORER, ago, short, usd } from "@/lib/api";
import { IBolt, ICheck, IChart, ICube, IInfo, IUp, IWarn, IX } from "./icons";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="panel-title">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Sparkline({ values, tone = "cyan", height = 56 }: { values: number[]; tone?: "cyan" | "amber"; height?: number }) {
  const w = 220;
  const pts = values.length > 1 ? values : [0, ...(values.length ? values : [0])];
  const max = Math.max(...pts, 1e-9);
  const min = Math.min(...pts);
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, height - 6 - ((v - min) / (max - min || 1)) * (height - 14)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = tone === "cyan" ? "#36d9e8" : "#ffb65c";
  const id = `sp-${tone}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-g`}>
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <path d={`${d} L${w},${height} L0,${height}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="3" opacity=".6" filter={`url(#${id}-g)`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export function Stat({
  label,
  value,
  sub,
  delta,
  icon,
  tone = "cyan",
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  icon?: React.ReactNode;
  tone?: "cyan" | "amber";
  spark?: number[];
}) {
  return (
    <div className={`panel edge ${tone === "amber" ? "edge-amber" : ""} flex flex-col p-4`}>
      <div className={`mb-3 ${tone === "cyan" ? "text-cyan" : "text-amber"}`}>{icon ?? <IChart size={18} />}</div>
      <div className="text-[14px] text-white/85">{label}</div>
      <div className="num mt-1 text-[26px] font-semibold tracking-tight">{value}</div>
      {(delta || sub) && (
        <div className="mt-1 flex items-center gap-1.5 text-[13px]">
          {delta && (
            <span className="flex items-center gap-0.5 font-medium text-success">
              <IUp size={13} />
              {delta}
            </span>
          )}
          {sub && <span className="text-white/75">{sub}</span>}
        </div>
      )}
      {spark && spark.length > 1 && (
        <div className="-mx-1 mt-auto pt-3">
          <Sparkline values={spark} tone={tone} />
        </div>
      )}
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
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
  splitter?: { receivedUsdc: number; sweptUsdc: number; forwardedUsdc: number; owedUsdc: number; accelerated: boolean };
};

export function LienRow({ l }: { l: Lien }) {
  const pct = Math.min(100, (l.repaidUsdc / (l.repayCapUsdc || 1)) * 100);
  return (
    <div className="rise grid grid-cols-1 gap-4 py-4 sm:grid-cols-[120px_1fr_1.3fr_110px] sm:items-center">
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
        <div className="text-[18px] font-semibold">Lien #{l.id}</div>
        <StatusChip status={l.status} />
      </div>
      <div className="space-y-1 text-[13px]">
        <div className="text-white/85">
          Seller{" "}
          <Link href={`/lien/${l.seller}`} className="mono text-[12px] text-ice underline decoration-line underline-offset-4 hover:text-cyan">
            {short(l.seller)}
          </Link>
        </div>
        <div className="text-muted">
          payTo → splitter <Addr a={l.payTo} />
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-[12px] text-muted">
          <span>
            repaid <span className="num text-white">{usd(l.repaidUsdc, 4)}</span> of <span className="num">{usd(l.repayCapUsdc, 4)}</span>
          </span>
          <span className="num text-cyan">{pct.toFixed(1)}%</span>
        </div>
        <div className="track">
          <div className={l.status === "Frozen" ? "fill-danger" : "fill-cyan"} style={{ width: `${pct}%` }} />
        </div>
        {l.splitter && (
          <div className="mt-1.5 text-[12px] text-muted">
            routed <span className="num text-white/85">{usd(l.splitter.receivedUsdc, 4)}</span> · to seller{" "}
            <span className="num text-white/85">{usd(l.splitter.forwardedUsdc, 4)}</span>
            {l.splitter.accelerated && <span className="ml-1 text-danger">· sweeping 100%</span>}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="num text-[18px] font-semibold">{usd(l.principalUsdc, 2)}</div>
        <div className="text-[12px] text-muted">sweep {(l.sweepBps / 100).toFixed(0)}%</div>
      </div>
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

export function DecisionCard({ f }: { f: FeedItem }) {
  const d = f.decision!;
  const [open, setOpen] = useState(false);
  const kind = ACTION_KIND[d.action] ?? "info";
  const Icon = KIND_ICON[kind];
  const who = d.agent === "human" ? "Operator (human)" : `${d.agent[0].toUpperCase()}${d.agent.slice(1)} agent`;
  return (
    <article className={`alert alert-${kind} rise !items-start !py-4`}>
      <Icon size={26} className={`mt-0.5 shrink-0 ${KIND_TEXT[kind]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className={`text-[15px] font-semibold capitalize ${KIND_TEXT[kind]}`}>{d.action.replaceAll("_", " ")}</span>
            <span className="text-[12px] text-muted">{who}</span>
            {d.escalated && <span className="chip !h-5 border-amber/40 text-amber">human review</span>}
          </div>
          <div className="text-[12px] text-muted">
            {d.agent !== "treasury" && (
              <>
                <Link href={`/lien/${f.args.subject}`} className="mono underline decoration-line underline-offset-4 hover:text-cyan">
                  {short(f.args.subject)}
                </Link>{" "}
                ·{" "}
              </>
            )}
            {ago(f.at)} ·{" "}
            <a href={f.txUrl} target="_blank" className="underline decoration-line underline-offset-4 hover:text-cyan">
              on Arc
            </a>
          </div>
        </div>
        {d.terms && d.terms.advanceUsdc ? (
          <div className="num mt-2 flex flex-wrap gap-2 text-[12px]">
            <span className="chip text-white">advance {usd(d.terms.advanceUsdc, 2)}</span>
            <span className="chip text-white/85">sweep {((d.terms.sweepBps ?? 0) / 100).toFixed(0)}%</span>
            <span className="chip text-white/85">fee {((d.terms.feeBps ?? 0) / 100).toFixed(1)}%</span>
            <span className="chip text-white/85">{d.terms.termDays}d term</span>
            {d.riskScore !== undefined && <span className="chip text-amber">risk {d.riskScore}</span>}
          </div>
        ) : d.riskScore !== undefined ? (
          <div className="num mt-2 flex gap-2 text-[12px]">
            <span className="chip text-amber">risk {d.riskScore}/100</span>
            {d.revenueQuality && <span className="chip text-white/85">revenue {d.revenueQuality}</span>}
          </div>
        ) : null}
        <p className={`mt-2 text-[13px] leading-relaxed text-white/80 ${open ? "" : "line-clamp-3"}`}>{d.rationale}</p>
        {d.rationale.length > 260 && (
          <button onClick={() => setOpen(!open)} className="mt-1 text-[12px] font-medium text-cyan hover:underline">
            {open ? "Hide reasoning" : "Read full reasoning"}
          </button>
        )}
        {open && d.flags && d.flags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {d.flags.map((x) => (
              <span key={x} className="mono rounded-md border border-line bg-midnight/60 px-1.5 py-0.5 text-[10.5px] text-muted">
                {x}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

const ST = ["None", "Active", "Frozen", "Repaid", "Defaulted"];
const EVENT_TEXT: Record<string, (a: any) => [string, React.ReactNode]> = {
  LienOpened: (a) => [`Lien #${a.lienId} opened · ${usd(Number(a.principal) / 1e6, 2)} principal, cap ${usd(Number(a.repayCap) / 1e6, 4)}`, <ICube key="i" size={16} />],
  LienRepayment: (a) => [`Sweep → pool ${usd(Number(a.amount) / 1e6, 4)} on lien #${a.lienId}`, <IUp key="i" size={16} />],
  LienStatusChanged: (a) => [`Lien #${a.lienId} ${ST[Number(a.from)]} → ${ST[Number(a.to)]}`, <IWarn key="i" size={16} />],
  AdvanceDisbursed: (a) => [`Disbursed ${usd(Number(a.amount) / 1e6, 2)} USDC to ${short(a.seller)}`, <IBolt key="i" size={16} />],
  SplitterCreated: (a) => [`Splitter ${short(a.splitter)} deployed for ${short(a.seller)}`, <ICube key="i" size={16} />],
  IdleDeployed: (a) => [`Parked ${usd(Number(a.assets) / 1e6, 2)} in USYC`, <IChart key="i" size={16} />],
  IdleRecalled: (a) => [`Recalled ${usd(Number(a.assets) / 1e6, 2)} from USYC`, <IChart key="i" size={16} />],
  AdvanceProposed: (a) => [`Advance of ${usd(Number(a.amount) / 1e6, 2)} queued for human approval`, <IWarn key="i" size={16} />],
};

export function EventLine({ f }: { f: FeedItem }) {
  const e = EVENT_TEXT[f.event]?.(f.args);
  if (!e) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-glass/60 text-cyan">{e[1]}</span>
      <span className="flex-1 text-[13px] text-white/85">{e[0]}</span>
      <a href={f.txUrl} target="_blank" className="shrink-0 text-[12px] text-muted hover:text-cyan">
        {ago(f.at)}
      </a>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`tab ${o.value === value ? "active edge glow-cyan" : ""}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
