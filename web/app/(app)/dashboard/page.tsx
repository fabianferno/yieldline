"use client";
import { useState } from "react";
import Link from "next/link";
import { ago, usePoll, useTick, usd } from "@/lib/api";
import { ActivityList, Addr, DecisionEntry, LienCard, LienRow, Panel, Skeleton, Tabs, type FeedItem, type Lien } from "@/components/ui";
import { IArrow, PrismCube } from "@/components/icons";
import { AnimatePresence, motion } from "motion/react";
import { Num } from "@/components/motion";

type Overview = {
  addresses: { registry: string; pool: string; teller: string; explorer: string };
  pool: {
    liquidityUsdc: number;
    navUsdc: number;
    outstandingPrincipalUsdc: number;
    totalAdvancedUsdc: number;
    totalRepaidUsdc: number;
    feesEarnedUsdc: number;
    idleInUsycUsdc: number;
    writtenOffUsdc: number;
    limits: Record<string, number>;
  };
  liens: Lien[];
  metrics: Record<string, number>;
  feed: FeedItem[];
};

type Filter = "all" | "underwriter" | "monitor" | "human";

export default function Home() {
  const { data, error, updatedAt } = usePoll<Overview>("/api/overview", 6000);
  useTick(5000);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(8);

  const decisions = data?.feed.filter((f) => f.event === "Decision" && f.decision) ?? [];
  const byAgent = (a: Filter) => decisions.filter((d) => a === "all" || d.decision!.agent === a || (a === "monitor" && d.decision!.agent === "treasury"));
  const shown = byAgent(filter);
  const events = data?.feed.filter((f) => f.event !== "Decision") ?? [];
  const liens = [...(data?.liens ?? [])].reverse();
  const live = liens.filter((l) => l.status === "Active" || l.status === "Frozen");
  const past = liens.filter((l) => !live.includes(l));
  const lastMonitor = decisions.find((d) => d.decision!.agent === "monitor");
  const m = data?.metrics;

  return (
    <div className="space-y-5">
      {/* Intro + the loop, live */}
      <section className="panel edge relative overflow-hidden">
        <div className="relative flex items-center gap-8 p-5 sm:p-7">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Dashboard</h1>
              <LiveBadge updatedAt={updatedAt} error={!!error} />
            </div>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-white/75">
              An agent advances USDC to x402 sellers against revenue it can verify on Arc, then takes repayment from every incoming payment
              through a splitter the seller sets as <span className="mono text-ice">payTo</span>. Each advance is recorded on chain as a public lien (a claim on that revenue), so the same
              revenue can&apos;t be borrowed against twice.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/lookup" className="btn btn-primary">
                Look up a seller <IArrow size={16} />
              </Link>
              <a href="https://github.com/sirbadenpowell/horos" target="_blank" className="btn btn-ghost">
                Read the code
              </a>
            </div>
          </div>
          <div className="pointer-events-none shrink-0 max-md:hidden">
            <PrismCube size={150} />
          </div>
        </div>

        <ol id="tour-loop" className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-5">
          <Step n="Underwrite" value={<Num value={m?.decisions} format={(n) => String(Math.round(n))} />} sub={`decisions · ${m?.rejected ?? 0} rejected · ${m?.escalated ?? 0} to a human`} />
          <Step n="Advance" value={<Num value={m?.advancedUsdc} format={(n) => usd(n, 2)} />} sub={`${m?.advances ?? 0} advance · ${m?.sellersFinanced ?? 0} seller`} />
          <Step n="Repay" value={<Num value={m?.repaidViaSweepsUsdc} format={(n) => usd(n, 4)} />} sub={`repaid from ${usd(m?.revenueRoutedUsdc, 2)} routed`} tone="cyan" />
          <Step n="Watch" value={lastMonitor ? ago(lastMonitor.at) : "—"} sub={`last monitor check · ${m?.freezes ?? 0} freezes`} />
          <Step n="Park idle cash" value={<Num value={data?.pool.idleInUsycUsdc} format={(n) => usd(n, 2)} />} sub="in USYC (mock teller)" tone="amber" last />
        </ol>
      </section>

      {error && !data && (
        <div className="alert alert-error text-[13px]">
          <span className="text-danger">Can&apos;t reach the Horos API.</span> {error}. Retrying every 6 seconds.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title={live.length === 1 ? "Active advance" : "Active advances"} right="recorded in the LienRegistry on Arc">
            {!data ? (
              <Skeleton rows={3} />
            ) : live.length ? (
              <div id="tour-advance" className="space-y-8">
                {live.map((l) => (
                  <LienCard key={l.id} l={l} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                No active advances. When the underwriter funds an offer, the advance and its repayment split appear here.
              </p>
            )}
            {past.length > 0 && (
              <div className="mt-6 border-t border-line pt-3">
                <div className="mb-1 text-[12px] text-muted">Closed</div>
                <div className="divide-y divide-line">
                  {past.map((l) => (
                    <LienRow key={l.id} l={l} />
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Agent decisions" right="each one anchored on Arc with its reasoning">
            <div id="tour-decisions" className="overflow-x-auto">
              <Tabs<Filter>
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setLimit(8);
                }}
                options={[
                  { value: "all", label: "All", count: decisions.length },
                  { value: "underwriter", label: "Underwriter", count: byAgent("underwriter").length },
                  { value: "monitor", label: "Monitor", count: byAgent("monitor").length },
                  { value: "human", label: "Operator", count: byAgent("human").length },
                ]}
              />
            </div>
            <div className="divide-y divide-line">
              {!data ? (
                <Skeleton rows={4} />
              ) : shown.length ? (
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.slice(0, limit).map((f) => (
                    <DecisionEntry key={f.tx + f.at} f={f} />
                  ))}
                </AnimatePresence>
              ) : (
                <p className="py-6 text-[13px] text-muted">No decisions from this agent yet.</p>
              )}
            </div>
            {shown.length > limit && (
              <button onClick={() => setLimit(limit + 10)} className="btn btn-ghost mt-2 w-full">
                Show {Math.min(10, shown.length - limit)} more
              </button>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <PoolPanel data={data} />
          <Panel title="On-chain activity" right="newest first">
            {!data ? <Skeleton rows={5} /> : <ActivityList items={events} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LiveBadge({ updatedAt, error }: { updatedAt: number | null; error: boolean }) {
  const stale = error || !updatedAt || Date.now() - updatedAt > 30_000;
  return (
    <span className={`chip ${stale ? "text-amber" : "text-success"}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${stale ? "" : "pulse"}`} />
      {!updatedAt ? "Connecting…" : stale ? "Reconnecting" : `Live · ${Math.max(0, Math.round((Date.now() - updatedAt) / 1000))}s ago`}
    </span>
  );
}

function Step({ n, value, sub, tone, last }: { n: string; value: React.ReactNode; sub: string; tone?: "cyan" | "amber"; last?: boolean }) {
  return (
    <li className={`bg-[#0e0e11] px-5 py-4 sm:px-6 ${last ? "max-md:col-span-2" : ""}`}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-white/85">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "amber" ? "bg-amber" : "bg-cyan"}`} />
        {n}
      </div>
      <div className={`num mt-1.5 text-[20px] font-semibold tracking-tight ${tone === "cyan" ? "text-cyan" : tone === "amber" ? "text-amber" : ""}`}>{value}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</div>
    </li>
  );
}

function PoolPanel({ data }: { data: Overview | null }) {
  const p = data?.pool;
  const nav = p?.navUsdc || 1;
  const parts = p
    ? [
        { k: "Liquid", v: p.liquidityUsdc, c: "bg-ice/80" },
        { k: "Lent out", v: p.outstandingPrincipalUsdc, c: "bg-cyan" },
        { k: "In USYC", v: p.idleInUsycUsdc, c: "bg-amber" },
      ]
    : [];
  const L = p?.limits;
  return (
    <Panel id="tour-pool" title="Lender pool" right={<span className="num text-[15px] font-semibold text-white">NAV <Num value={p?.navUsdc} format={(n) => usd(n, 2)} /></span>}>
      {!p ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {parts.map((x) => (
              <motion.div key={x.k} className={x.c} initial={{ flexGrow: 0 }} animate={{ flexGrow: x.v / nav }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} style={{ flexBasis: 0 }} />
            ))}
          </div>
          <dl className="mt-4 space-y-2 text-[13px]">
            {parts.map((x) => (
              <div key={x.k} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${x.c}`} />
                <dt className="flex-1 text-white/75">{x.k}</dt>
                <dd className="num">{usd(x.v, 2)}</dd>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-line pt-2">
              <span className="h-2 w-2" />
              <dt className="flex-1 text-white/75">Fees earned · written off</dt>
              <dd className="num">
                {usd(p.feesEarnedUsdc, 2)} · {usd(p.writtenOffUsdc, 2)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl border border-line bg-midnight/40 p-3.5 text-[12px] leading-relaxed text-white/75">
            <div className="mb-1.5 font-medium text-white/90">Limits enforced by the contract, not the prompt</div>
            <ul className="num grid grid-cols-2 gap-x-4 gap-y-1">
              <li>max advance {usd(L?.maxAdvanceUsdc, 0)}</li>
              <li>human above {usd(L?.autoApproveLimitUsdc, 0)}</li>
              <li>≤{(L?.maxExposureBps ?? 0) / 100}% NAV per seller</li>
              <li>
                sweep {(L?.minSweepBps ?? 0) / 100}–{(L?.maxSweepBps ?? 0) / 100}%
              </li>
            </ul>
            <div className="mt-1">Only a human can mark a default.</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            <span>
              Registry <Addr a={data?.addresses.registry} />
            </span>
            <span>
              Pool <Addr a={data?.addresses.pool} />
            </span>
            <span>
              Teller <Addr a={data?.addresses.teller} />
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
