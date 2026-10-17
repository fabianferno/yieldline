"use client";
import Link from "next/link";
import { usePoll, usd, short } from "@/lib/api";
import type { PoolInfo, PoolLimits } from "@/lib/types";
import { pct } from "@/lib/types";
import { Skeleton } from "@/components/ui";
import { IArrow } from "@/components/icons";

type Pools = { caps: PoolLimits | null; pools: PoolInfo[] };

export default function Markets() {
  const { data, error } = usePoll<Pools>("/api/pools", 8000);
  const pools = data ? [...data.pools].sort((a, b) => b.version - a.version || b.totalAssetsUsdc - a.totalAssetsUsdc) : [];
  const open = pools.filter((p) => p.version === 2);
  const tvl = open.reduce((s, p) => s + p.totalAssetsUsdc, 0);
  const lent = pools.reduce((s, p) => s + p.outstandingPrincipalUsdc, 0);
  const c = data?.caps;

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Lending pools</h1>
        <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-white/75">
          Each pool is run by a curator who sets its risk limits. Lenders deposit USDC and earn the flat fees sellers pay. The Yieldline agent
          underwrites every seller once; the seller then picks a pool whose limits fit. All pools share one public lien registry, so no
          seller can borrow from two of them against the same revenue.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/borrow" className="btn btn-primary">
            Get working capital <IArrow size={16} />
          </Link>
          <Link href="/curate" className="btn btn-ghost">
            Start a pool
          </Link>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stat k="Open pools" v={data ? String(open.length) : "…"} />
          <Stat k="Deposited in open pools" v={data ? usd(tvl, 2) : "…"} />
          <Stat k="Lent out now" v={data ? usd(lent, 2) : "…"} />
          <Stat k="Fees earned" v={data ? usd(pools.reduce((s, p) => s + p.feesEarnedUsdc, 0), 4) : "…"} />
        </dl>
      </section>

      {error && !data && <div className="alert alert-error text-[13px]">Can&apos;t reach the Yieldline API: {error}. Retrying.</div>}

      <section id="tour-pools" className="panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))_24px] gap-4 border-b border-line px-5 py-3 text-[12px] text-muted lg:grid">
          <span>Pool</span>
          <span className="text-right">Deposits</span>
          <span className="text-right">Free cash</span>
          <span className="text-right">Lent out</span>
          <span className="text-right">Share price</span>
          <span className="text-right">Takes risk ≤</span>
          <span />
        </div>
        {!data ? (
          <div className="p-5">
            <Skeleton rows={3} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {pools.map((p) => (
              <li key={p.address}>
                <Link
                  href={`/pools/${p.address}`}
                  className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 hover:bg-white/[0.025] lg:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))_24px] lg:items-center"
                >
                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold tracking-tight">{p.name}</span>
                      {p.version === 1 ? <span className="chip text-amber">Operator pilot · closed to deposits</span> : <span className="chip text-success">Open</span>}
                    </div>
                    <div className="mt-1 text-[12px] text-muted">
                      Curator <span className="mono">{short(p.curator)}</span> · {p.liveLiens ?? 0} live lien{p.liveLiens === 1 ? "" : "s"} · max advance{" "}
                      {usd(p.limits.maxAdvanceUsdc, 0)}
                    </div>
                  </div>
                  <Cell k="Deposits" v={usd(p.totalAssetsUsdc, 2)} />
                  <Cell k="Free cash" v={usd(p.liquidityUsdc, 2)} />
                  <Cell k="Lent out" v={usd(p.outstandingPrincipalUsdc, 2)} />
                  <Cell k="Share price" v={p.sharePrice === null ? "—" : `$${p.sharePrice.toFixed(4)}`} />
                  <Cell k="Takes risk ≤" v={p.version === 1 ? "—" : String(p.limits.maxRiskScore)} />
                  <IArrow size={16} className="max-lg:hidden text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {c && (
        <p className="px-1 text-[12px] leading-relaxed text-muted">
          Protocol caps every pool stays within (testnet): advance up to {usd(c.maxAdvanceUsdc, 0)}, curator approval above at most{" "}
          {usd(c.autoApproveLimitUsdc, 0)}, at most {pct(c.maxExposureBps)} of a pool per seller, sweep {pct(c.minSweepBps)}–{pct(c.maxSweepBps)}, fee up to{" "}
          {pct(c.maxFeeBps)}, term up to {c.maxTermDays} days. Share price starts at $1.0000; it rises with fees and falls with defaults.
        </p>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="num mt-1 text-[20px] font-semibold tracking-tight">{v}</dd>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="lg:text-right">
      <div className="text-[11px] text-muted lg:hidden">{k}</div>
      <div className="num text-[14px]">{v}</div>
    </div>
  );
}
