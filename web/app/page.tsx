"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePoll, usd } from "@/lib/api";
import { Addr, DecisionCard, EventLine, LienRow, Panel, Stat, Tabs, type FeedItem, type Lien } from "@/components/ui";
import { IArrow, IBolt, IChart, ICube, IUsers, PrismCube } from "@/components/icons";

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
  const { data, error } = usePoll<Overview>("/api/overview", 6000);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(10);
  const decisions = data?.feed.filter((f) => f.event === "Decision" && f.decision) ?? [];
  const shown = decisions.filter((d) => filter === "all" || d.decision!.agent === filter || (filter === "monitor" && d.decision!.agent === "treasury"));
  const events = data?.feed.filter((f) => f.event !== "Decision") ?? [];

  // cumulative repayment series (oldest → newest) for the sweep sparkline
  const repaySeries = useMemo(() => {
    const reps = events.filter((e) => e.event === "LienRepayment").reverse();
    let c = 0;
    return [0, ...reps.map((r) => (c += Number(r.args.amount) / 1e6))];
  }, [events]);
  const decisionSeries = useMemo(() => {
    const ds = [...decisions].reverse();
    return ds.map((_, i) => i + 1);
  }, [decisions]);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="panel edge relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 opacity-95 max-lg:hidden">
          <PrismCube size={230} />
        </div>
        <div className="relative max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-cyan">Working capital for x402 sellers</div>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[44px]">
            An agent lends against on-chain revenue, and carves every debt in public.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Horos reads a seller&apos;s x402 receipts on Arc, decides whether the revenue is real, advances USDC, and sweeps repayment from
            every incoming payment through a splitter the seller sets as <span className="mono text-ice">payTo</span>. Each advance is a lien in a
            public registry, so no one can borrow twice against the same revenue.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/explorer" className="btn btn-primary edge glow-cyan">
              Look up a seller <IArrow size={16} />
            </Link>
            <a href="https://github.com/sirbadenpowell/horos" target="_blank" className="btn btn-secondary edge edge-amber glow-amber">
              Read the code
            </a>
          </div>
        </div>
      </section>

      {error && !data && (
        <div className="alert alert-error text-[13px]">
          <span className="text-danger">API unreachable:</span> {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="USDC advanced"
          value={usd(data?.metrics.advancedUsdc)}
          sub={`${data?.metrics.advances ?? 0} advance${data?.metrics.advances === 1 ? "" : "s"} · ${data?.metrics.sellersFinanced ?? 0} seller`}
          icon={<IBolt size={20} />}
        />
        <Stat
          label="Repaid via sweeps"
          value={usd(data?.metrics.repaidViaSweepsUsdc, 4)}
          sub={`of ${usd(data?.metrics.revenueRoutedUsdc, 4)} routed`}
          icon={<IChart size={20} />}
          spark={repaySeries}
        />
        <Stat
          label="Agent decisions"
          value={String(data?.metrics.decisions ?? 0)}
          sub={`${data?.metrics.escalated ?? 0} escalated to a human`}
          icon={<ICube size={20} />}
          tone="amber"
          spark={decisionSeries}
        />
        <Stat
          label="Rejected · Frozen"
          value={`${data?.metrics.rejected ?? 0} · ${data?.metrics.freezes ?? 0}`}
          sub="wash trades · diversions"
          icon={<IUsers size={20} />}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Panel title="Liens" right={<span className="text-[12px] text-muted">LienRegistry · Arc testnet</span>}>
            {data?.liens.length ? (
              <div className="divide-y divide-line">
                {[...data.liens].reverse().map((l) => (
                  <LienRow key={l.id} l={l} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No liens yet.</p>
            )}
          </Panel>

          <Panel title="Agent decisions" right={<span className="text-[12px] text-muted">published on chain, with reasons</span>}>
            <div className="mb-4">
              <Tabs<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "underwriter", label: "Underwriter" },
                  { value: "monitor", label: "Monitor" },
                  { value: "human", label: "Operator" },
                ]}
              />
            </div>
            <div className="space-y-3">
              {shown.length ? shown.slice(0, limit).map((f) => <DecisionCard key={f.tx + f.at} f={f} />) : <p className="text-[13px] text-muted">No decisions yet.</p>}
            </div>
            {shown.length > limit && (
              <button onClick={() => setLimit(limit + 10)} className="btn btn-ghost mt-4 w-full">
                Show more ({shown.length - limit})
              </button>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Lender pool">
            <div className="text-[13px]">
              <Row k="Liquid USDC" v={usd(data?.pool.liquidityUsdc, 4)} />
              <Row k="Parked in USYC (mock)" v={usd(data?.pool.idleInUsycUsdc, 4)} />
              <Row k="Outstanding principal" v={usd(data?.pool.outstandingPrincipalUsdc, 4)} />
              <Row k="Fees earned" v={usd(data?.pool.feesEarnedUsdc, 4)} />
              <Row k="Written off" v={usd(data?.pool.writtenOffUsdc, 4)} />
              <div className="divider my-2" />
              <Row k="NAV" v={usd(data?.pool.navUsdc, 4)} strong />
            </div>
            <div className="alert alert-info mt-4 !items-start text-[12px] leading-relaxed text-white/80">
              <span>
                Hard limits live in the pool contract, not the prompt: max advance {usd(data?.pool.limits.maxAdvanceUsdc)} · human approval above{" "}
                {usd(data?.pool.limits.autoApproveLimitUsdc)} · ≤{(data?.pool.limits.maxExposureBps ?? 0) / 100}% of NAV per seller · sweep{" "}
                {(data?.pool.limits.minSweepBps ?? 0) / 100}–{(data?.pool.limits.maxSweepBps ?? 0) / 100}% · defaults are human-only.
              </span>
            </div>
          </Panel>

          <Panel title="On-chain activity">
            {events.length ? (
              <div>
                {events.slice(0, 30).map((f) => (
                  <EventLine key={f.tx + f.event + (f.args?.lienId ?? "") + (f.args?.amount ?? "")} f={f} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">Nothing yet.</p>
            )}
          </Panel>

          <Panel title="Contracts">
            <div className="text-[13px]">
              <Row k="LienRegistry" v={<Addr a={data?.addresses.registry} />} />
              <Row k="LenderPool" v={<Addr a={data?.addresses.pool} />} />
              <Row k="USYC Teller (mock)" v={<Addr a={data?.addresses.teller} />} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "text-[15px] font-semibold" : ""}`}>
      <span className={strong ? "text-white" : "text-muted"}>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
