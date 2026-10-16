"use client";
import Link from "next/link";
import { EXPLORER, ago, short, usd } from "@/lib/api";

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "terra" | "olive" | "blood" }) {
  const color = tone === "terra" ? "text-terra" : tone === "olive" ? "text-olive" : tone === "blood" ? "text-blood" : "text-ink";
  return (
    <div className="rounded-sm border border-rule bg-card px-4 py-3">
      <div className="engraved text-[10px] text-ink-3">{label}</div>
      <div className={`num mt-1 text-2xl ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Section({ title, kicker, children, right }: { title: string; kicker?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-rule pb-2">
        <div>
          {kicker && <div className="engraved text-[10px] text-terra">{kicker}</div>}
          <h2 className="font-serif text-2xl font-semibold">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<string, string> = {
  Active: "bg-olive/10 text-olive border-olive/30",
  Frozen: "bg-blood/10 text-blood border-blood/30",
  Repaid: "bg-ink/5 text-ink-2 border-rule",
  Defaulted: "bg-blood text-card border-blood",
};

export function StatusChip({ status }: { status: string }) {
  return <span className={`engraved rounded-sm border px-2 py-0.5 text-[10px] ${STATUS_TONE[status] ?? "border-rule"}`}>{status}</span>;
}

export function Addr({ a, href }: { a?: string | null; href?: string }) {
  if (!a) return <span className="text-ink-3">—</span>;
  return (
    <a className="num text-xs underline decoration-rule underline-offset-2 hover:text-terra" href={href ?? `${EXPLORER}/address/${a}`} target="_blank">
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
    <div className="rise grid grid-cols-1 gap-3 border-b border-rule py-4 last:border-0 sm:grid-cols-[80px_1fr_1.2fr_120px] sm:items-center">
      <div className="flex items-center gap-2 sm:block">
        <div className="font-serif text-xl">#{l.id}</div>
        <StatusChip status={l.status} />
      </div>
      <div className="text-sm">
        <div>
          Seller <Link href={`/lien/${l.seller}`} className="num text-xs underline decoration-rule underline-offset-2 hover:text-terra">{short(l.seller)}</Link>
        </div>
        <div className="text-ink-3">
          payTo → splitter <Addr a={l.payTo} />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-ink-3">
          <span>
            repaid <span className="num text-ink">{usd(l.repaidUsdc, 4)}</span> of <span className="num">{usd(l.repayCapUsdc, 4)}</span>
          </span>
          <span className="num">{pct.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-paper-2">
          <div className={`h-full ${l.status === "Frozen" ? "bg-blood" : "bg-olive"}`} style={{ width: `${pct}%`, transition: "width .6s" }} />
        </div>
        {l.splitter && (
          <div className="mt-1 text-xs text-ink-3">
            revenue routed <span className="num">{usd(l.splitter.receivedUsdc, 4)}</span> · to seller{" "}
            <span className="num">{usd(l.splitter.forwardedUsdc, 4)}</span>
            {l.splitter.accelerated && <span className="ml-1 text-blood">· sweeping 100%</span>}
          </div>
        )}
      </div>
      <div className="text-right text-sm">
        <div className="num">{usd(l.principalUsdc, 2)}</div>
        <div className="text-xs text-ink-3">sweep {(l.sweepBps / 100).toFixed(0)}%</div>
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

const ACTION_TONE: Record<string, string> = {
  offer: "text-olive",
  fund: "text-olive",
  continue: "text-ink-2",
  unfreeze: "text-olive",
  reject: "text-blood",
  freeze: "text-blood",
  escalate: "text-ochre",
  escalate_default: "text-blood",
  hold: "text-ochre",
  adjust_sweep: "text-ochre",
  deploy_idle: "text-terra",
  recall_idle: "text-terra",
};

export function DecisionCard({ f }: { f: FeedItem }) {
  const d = f.decision!;
  return (
    <article className="rise rounded-sm border border-rule bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="engraved text-[10px] text-ink-3">{d.agent} agent</span>
          <span className={`font-serif text-xl font-semibold ${ACTION_TONE[d.action] ?? ""}`}>{d.action.replace("_", " ")}</span>
          {d.escalated && <span className="engraved rounded-sm bg-ochre/15 px-1.5 text-[10px] text-ochre">human review</span>}
        </div>
        <div className="text-xs text-ink-3">
          {d.agent !== "treasury" && (
            <>
              <Link href={`/lien/${f.args.subject}`} className="num underline decoration-rule">{short(f.args.subject)}</Link> ·{" "}
            </>
          )}
          {ago(f.at)} ·{" "}
          <a href={f.txUrl} target="_blank" className="underline decoration-rule hover:text-terra">on-chain</a>
        </div>
      </div>
      {d.terms && d.terms.advanceUsdc ? (
        <div className="num mt-2 flex flex-wrap gap-x-4 text-xs text-ink-2">
          <span>advance {usd(d.terms.advanceUsdc, 2)}</span>
          <span>sweep {((d.terms.sweepBps ?? 0) / 100).toFixed(0)}%</span>
          <span>fee {((d.terms.feeBps ?? 0) / 100).toFixed(1)}%</span>
          <span>term {d.terms.termDays}d</span>
          {d.riskScore !== undefined && <span>risk {d.riskScore}/100</span>}
        </div>
      ) : d.riskScore !== undefined ? (
        <div className="num mt-2 text-xs text-ink-2">risk {d.riskScore}/100 · revenue {d.revenueQuality}</div>
      ) : null}
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{d.rationale}</p>
      {d.flags && d.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.flags.map((x) => (
            <span key={x} className="num rounded-sm bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-2">{x}</span>
          ))}
        </div>
      )}
    </article>
  );
}

const EVENT_TEXT: Record<string, (a: any) => string> = {
  LienOpened: (a) => `Lien #${a.lienId} opened · ${usd(Number(a.principal) / 1e6, 2)} principal, cap ${usd(Number(a.repayCap) / 1e6, 4)}`,
  LienRepayment: (a) => `Sweep → pool ${usd(Number(a.amount) / 1e6, 4)} on lien #${a.lienId}`,
  LienStatusChanged: (a) => `Lien #${a.lienId} ${["None", "Active", "Frozen", "Repaid", "Defaulted"][Number(a.from)]} → ${["None", "Active", "Frozen", "Repaid", "Defaulted"][Number(a.to)]}`,
  AdvanceDisbursed: (a) => `Disbursed ${usd(Number(a.amount) / 1e6, 2)} USDC to ${short(a.seller)}`,
  SplitterCreated: (a) => `Splitter ${short(a.splitter)} deployed for ${short(a.seller)}`,
  IdleDeployed: (a) => `Parked ${usd(Number(a.assets) / 1e6, 2)} in USYC`,
  IdleRecalled: (a) => `Recalled ${usd(Number(a.assets) / 1e6, 2)} from USYC`,
  AdvanceProposed: (a) => `Advance of ${usd(Number(a.amount) / 1e6, 2)} queued for human approval`,
};

export function EventLine({ f }: { f: FeedItem }) {
  const text = EVENT_TEXT[f.event]?.(f.args);
  if (!text) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-rule/60 py-1.5 text-xs last:border-0">
      <span className="text-ink-2">{text}</span>
      <a href={f.txUrl} target="_blank" className="shrink-0 text-ink-3 underline decoration-rule hover:text-terra">{ago(f.at)}</a>
    </div>
  );
}
