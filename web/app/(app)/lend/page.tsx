"use client";
import { useState } from "react";
import Link from "next/link";
import { usePoll, usd } from "@/lib/api";
import type { Account, PoolInfo } from "@/lib/types";
import { useWallet } from "@/lib/wallet";
import { NeedsAccount } from "@/components/Connect";
import { DepositPanel } from "@/components/DepositPanel";
import { Panel, Skeleton } from "@/components/ui";

export default function Lend() {
  const w = useWallet();
  const { data: acct } = usePoll<Account>(w.address ? `/api/accounts/${w.address}` : null, 8000);
  const { data: pools } = usePoll<{ pools: PoolInfo[] }>("/api/pools", 10000);
  const open = pools?.pools.filter((p) => p.version === 2) ?? [];
  const [pick, setPick] = useState<string>();
  const chosen = open.find((p) => p.address === pick) ?? open[0];

  if (w.status !== "ready") return <NeedsAccount what="lend" />;

  const total = acct?.positions.reduce((s, p) => s + p.valueUsdc, 0) ?? 0;
  const free = acct?.positions.reduce((s, p) => s + p.withdrawableUsdc, 0) ?? 0;

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Lend</h1>
        <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-white/75">
          Deposit USDC into a pool and receive shares. Sellers repay advances plus a flat fee from their x402 revenue, which raises the share
          price. If a curator marks a default, the written-off principal lowers it. You can withdraw whatever is not lent out at any time.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[12px] text-muted">Your deposits, valued now</dt>
            <dd className="num mt-1 text-[20px] font-semibold">{acct ? usd(total, 4) : "…"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Withdrawable now</dt>
            <dd className="num mt-1 text-[20px] font-semibold">{acct ? usd(free, 4) : "…"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">USDC in your account</dt>
            <dd className="num mt-1 text-[20px] font-semibold">{usd(w.usdc ?? 0, 2)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Your positions">
          {!acct ? (
            <Skeleton rows={2} />
          ) : acct.positions.length ? (
            <ul className="divide-y divide-line">
              {acct.positions.map((p) => (
                <li key={p.pool} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
                  <Link href={`/pools/${p.pool}`} className="min-w-[140px] flex-1 font-medium hover:text-cyan">
                    {p.name ?? p.pool}
                  </Link>
                  <span className="num text-[13px]">{usd(p.valueUsdc, 4)}</span>
                  <span className="text-[12px] text-muted">
                    <span className="num">{usd(p.withdrawableUsdc, 4)}</span> withdrawable
                  </span>
                  <button className="text-[12px] text-cyan underline underline-offset-4" onClick={() => setPick(p.pool)}>
                    Manage
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              No deposits yet. Pick a pool on the right, or compare them on{" "}
              <Link href="/markets" className="text-cyan underline underline-offset-4">
                Pools
              </Link>
              .
            </p>
          )}
        </Panel>

        <Panel
          title="Deposit or withdraw"
          right={
            open.length > 1 ? (
              <select className="input !h-8 !py-0 text-[12px]" value={chosen?.address} onChange={(e) => setPick(e.target.value)}>
                {open.map((p) => (
                  <option key={p.address} value={p.address}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              chosen?.name
            )
          }
        >
          {chosen ? (
            <>
              <p className="mb-3 text-[12px] leading-relaxed text-muted">
                {chosen.name} takes sellers at risk {chosen.limits.maxRiskScore} or lower · {usd(chosen.liquidityUsdc, 2)} free of {usd(chosen.totalAssetsUsdc, 2)}
              </p>
              <DepositPanel key={chosen.address} pool={chosen} />
            </>
          ) : (
            <Skeleton rows={3} />
          )}
        </Panel>
      </div>
    </div>
  );
}
