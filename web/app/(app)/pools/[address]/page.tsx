"use client";
import { use } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePoll, usd } from "@/lib/api";
import { pct, type PoolInfo, type Proposal } from "@/lib/types";
import { Addr, DecisionEntry, LienCard, LienRow, Panel, Skeleton, type FeedItem, type Lien } from "@/components/ui";
import { DepositPanel } from "@/components/DepositPanel";

type PoolView = { pool: PoolInfo; liens: (Lien & { lender: string })[]; proposals: Proposal[] };

export default function PoolPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const { data, error } = usePoll<PoolView>(`/api/pools/${address}`, 8000);
  const { data: act } = usePoll<{ feed: FeedItem[] }>(`/api/activity?pool=${address}`, 15000);
  const p = data?.pool;
  const live = data?.liens.filter((l) => l.status === "Active" || l.status === "Frozen") ?? [];
  const past = data?.liens.filter((l) => !live.includes(l)) ?? [];
  const decisions = act?.feed.filter((f) => f.event === "Decision" && f.decision) ?? [];

  if (error && !data) return <div className="alert alert-error text-[13px]">Could not load this pool: {error}</div>;

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <Link href="/markets" className="text-[12px] text-muted hover:text-cyan">
          ← All pools
        </Link>
        {!p ? (
          <Skeleton rows={2} />
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{p.name}</h1>
              {p.version === 1 ? <span className="chip text-amber">Operator pilot · closed to deposits</span> : <span className="chip text-success">Open to deposits</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              <span>
                Pool <Addr a={p.address} />
              </span>
              <span>
                Curator <Addr a={p.curator} />
              </span>
              {p.version === 2 && <span>Shares: {p.symbol}</span>}
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Stat k="Deposits" v={usd(p.totalAssetsUsdc, 2)} />
              <Stat k="Free cash" v={usd(p.liquidityUsdc, 2)} />
              <Stat k="Fees earned · written off" v={`${usd(p.feesEarnedUsdc, 4)} · ${usd(p.writtenOffUsdc, 2)}`} />
              <Stat k="Share price (since launch)" v={p.sharePrice === null ? "—" : `$${p.sharePrice.toFixed(4)}`} />
            </dl>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title={`Advances from this pool`} right="recorded in the shared LienRegistry">
            {!data ? (
              <Skeleton rows={3} />
            ) : live.length ? (
              <div className="space-y-8">
                {live.map((l) => (
                  <LienCard key={l.id} l={l} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No live advances. When a seller picks this pool and wires their splitter, the advance appears here.</p>
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

          {!!data?.proposals.length && (
            <Panel title="Waiting for the curator" right="above this pool's auto-approve limit">
              <ul className="divide-y divide-line text-[13px]">
                {data.proposals.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                    <span className="num font-medium">{usd(x.amountUsdc, 2)}</span>
                    <span className="text-muted">
                      to <Addr a={x.seller} />
                    </span>
                    <span className="text-muted">
                      fee {pct(x.feeBps)} · sweep {pct(x.sweepBps)} · {x.termDays}d
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Decisions for this pool" right="anchored on Arc with their reasoning">
            {!act ? (
              <Skeleton rows={3} />
            ) : decisions.length ? (
              <div className="divide-y divide-line">
                {decisions.slice(0, 12).map((f) => (
                  <DecisionEntry key={f.tx + f.at} f={f} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No decisions recorded on this pool yet.</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Lend">{p ? <DepositPanel pool={p} /> : <Skeleton rows={3} />}</Panel>
          {p && <Composition p={p} />}
          {p && <LimitsPanel p={p} />}
        </div>
      </div>
    </div>
  );
}

function Composition({ p }: { p: PoolInfo }) {
  const total = p.totalAssetsUsdc || 1;
  const parts = [
    { k: "Free cash", v: p.liquidityUsdc, c: "bg-ice/80" },
    { k: "Lent out", v: p.outstandingPrincipalUsdc, c: "bg-cyan" },
    { k: "In USYC (mock teller)", v: p.idleInUsycUsdc, c: "bg-amber" },
  ];
  return (
    <Panel title="Where the money is">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/5">
        {parts.map((x) => (
          <motion.div key={x.k} className={x.c} initial={{ flexGrow: 0 }} animate={{ flexGrow: x.v / total }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} style={{ flexBasis: 0 }} />
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
      </dl>
    </Panel>
  );
}

function LimitsPanel({ p }: { p: PoolInfo }) {
  const l = p.limits;
  return (
    <Panel title="This pool's rules" right="enforced by the contract">
      <ul className="space-y-1.5 text-[13px] leading-relaxed text-white/80">
        {p.version === 2 && <li>Accepts sellers the agent scores at risk {l.maxRiskScore} or lower (0 = safest, 100 = reject).</li>}
        <li>Advances up to {usd(l.maxAdvanceUsdc, 2)}; above {usd(l.autoApproveLimitUsdc, 2)} the curator must approve.</li>
        <li>One seller can take at most {pct(l.maxExposureBps)} of the pool.</li>
        <li>
          Sweep between {pct(l.minSweepBps)} and {pct(l.maxSweepBps)} of each payment; flat fee up to {pct(l.maxFeeBps)}; term up to {l.maxTermDays} days.
        </li>
        <li>Only the curator can mark a default. The written-off amount lowers the share price.</li>
      </ul>
    </Panel>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="num mt-1 text-[18px] font-semibold tracking-tight">{v}</dd>
    </div>
  );
}
