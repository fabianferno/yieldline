"use client";
import { usePoll, usd } from "@/lib/api";
import { Addr, DecisionCard, EventLine, LienRow, Section, Stat, type FeedItem, type Lien } from "@/components/ui";

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

export default function Home() {
  const { data, error } = usePoll<Overview>("/api/overview", 6000);
  const decisions = data?.feed.filter((f) => f.event === "Decision" && f.decision) ?? [];
  const events = data?.feed.filter((f) => f.event !== "Decision") ?? [];

  return (
    <>
      <div className="max-w-3xl">
        <div className="engraved text-[11px] text-terra">Working capital for businesses that earn through x402</div>
        <h1 className="mt-2 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
          An agent lends against on-chain revenue, and carves every debt in public stone.
        </h1>
        <p className="mt-3 text-ink-2">
          Horos reads a seller&apos;s x402 receipts on Arc, decides whether the revenue is real, advances USDC, and sweeps
          repayment from each incoming payment through a splitter the seller sets as <span className="num text-sm">payTo</span>.
          Every advance is a lien in a public registry, so no one can borrow twice against the same revenue.
        </p>
      </div>

      {error && !data && <div className="mt-6 rounded-sm border border-blood/30 bg-blood/5 p-3 text-sm text-blood">API unreachable: {error}</div>}

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="USDC advanced" value={usd(data?.metrics.advancedUsdc)} sub={`${data?.metrics.advances ?? 0} advances`} />
        <Stat label="Repaid via sweeps" value={usd(data?.metrics.repaidViaSweepsUsdc, 4)} tone="olive" />
        <Stat label="Revenue routed" value={usd(data?.metrics.revenueRoutedUsdc, 4)} sub="through splitters" />
        <Stat label="Agent decisions" value={String(data?.metrics.decisions ?? 0)} sub={`${data?.metrics.escalated ?? 0} escalated to a human`} />
        <Stat label="Rejected / frozen" value={`${data?.metrics.rejected ?? 0} / ${data?.metrics.freezes ?? 0}`} tone="blood" sub="wash trades · diversions" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Section title="Liens" kicker="Registry">
            {data?.liens.length ? (
              <div className="rounded-sm border border-rule bg-card px-4">
                {[...data.liens].reverse().map((l) => (
                  <LienRow key={l.id} l={l} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">No liens yet.</p>
            )}
          </Section>

          <Section title="Agent decisions" kicker="Published on chain, with reasons">
            <div className="space-y-3">
              {decisions.length ? decisions.slice(0, 30).map((f) => <DecisionCard key={f.tx + f.at} f={f} />) : <p className="text-sm text-ink-3">No decisions yet.</p>}
            </div>
          </Section>
        </div>

        <div>
          <Section title="Lender pool" kicker="Treasury">
            <div className="rounded-sm border border-rule bg-card p-4 text-sm">
              <Row k="Liquid USDC" v={usd(data?.pool.liquidityUsdc, 4)} />
              <Row k="Parked in USYC (mock)" v={usd(data?.pool.idleInUsycUsdc, 4)} />
              <Row k="Outstanding principal" v={usd(data?.pool.outstandingPrincipalUsdc, 4)} />
              <Row k="Fees earned" v={usd(data?.pool.feesEarnedUsdc, 4)} />
              <Row k="Written off" v={usd(data?.pool.writtenOffUsdc, 4)} />
              <Row k="NAV" v={usd(data?.pool.navUsdc, 4)} strong />
              <div className="mt-3 border-t border-rule pt-3 text-xs text-ink-3">
                Hard limits enforced by the pool contract, not the prompt: max advance {usd(data?.pool.limits.maxAdvanceUsdc)} ·
                human approval above {usd(data?.pool.limits.autoApproveLimitUsdc)} · ≤{(data?.pool.limits.maxExposureBps ?? 0) / 100}% of NAV per
                seller · sweep {(data?.pool.limits.minSweepBps ?? 0) / 100}–{(data?.pool.limits.maxSweepBps ?? 0) / 100}% · defaults are human-only.
              </div>
            </div>
          </Section>

          <Section title="On-chain activity" kicker="Pool + registry events">
            <div className="rounded-sm border border-rule bg-card px-4 py-2">
              {events.length ? events.slice(0, 40).map((f) => <EventLine key={f.tx + f.event + f.args?.lienId} f={f} />) : <p className="py-2 text-sm text-ink-3">Nothing yet.</p>}
            </div>
          </Section>

          <Section title="Contracts" kicker="Arc testnet">
            <div className="rounded-sm border border-rule bg-card p-4 text-sm">
              <Row k="LienRegistry" v={<Addr a={data?.addresses.registry} />} />
              <Row k="LenderPool" v={<Addr a={data?.addresses.pool} />} />
              <Row k="USYC Teller (mock)" v={<Addr a={data?.addresses.teller} />} />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-rule pt-2 font-semibold" : ""}`}>
      <span className="text-ink-2">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
