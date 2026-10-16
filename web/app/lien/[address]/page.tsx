"use client";
import { use } from "react";
import { usePoll, usd, short, EXPLORER } from "@/lib/api";
import { Addr, LienRow, Panel, Stat, type Lien } from "@/components/ui";
import { IBolt, ICheck, IChart, IExternal, IUsers, IWarn } from "@/components/icons";

type SellerView = {
  lien: {
    seller: string;
    encumbered: boolean;
    liveLienId: number;
    outstandingUsdc: number;
    record: { opened: number; repaid: number; defaulted: number; frozenEvents: number };
    splitter: string | null;
    liens: Lien[];
  };
  revenue: {
    x402Receipts: number;
    x402RevenueUsdc: number;
    bySettlement?: { exactOnChain: { calls: number; usdc: number }; gatewayBatched: { calls: number; usdc: number } };
    unsettledReceivablesUsdc?: number;
    nonX402InflowsUsdc: number;
    historyHours: number;
    last24hUsdc: number;
    prev24hUsdc: number;
    distinctPayers: number;
    payerHHI: number;
    topPayerShare: number;
    interArrivalCv: number | null;
    avgTicketUsdc: number;
    daily: { day: number; usdc: number; calls: number }[];
    hourly: { hoursAgo: number; usdc: number; calls: number }[];
    payerForensics: {
      payer: string;
      usdc: number;
      calls: number;
      share: number;
      walletAgeHours: number | null;
      fundedBy: string | null;
      fundedBySeller: boolean;
      fundedByLenderOperator: boolean;
      fundedByPublicFaucet?: boolean;
      activity: number;
    }[];
    commonFunders: { funder: string; payers: number }[];
  };
};

export default function SellerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const { data, error } = usePoll<SellerView>(`/api/seller/${address}`, 15000);
  const r = data?.revenue;
  const hourMap = new Map(r?.hourly.map((h) => [h.hoursAgo, h]) ?? []);
  const maxHour = Math.max(1e-9, ...(r?.hourly.map((h) => h.usdc) ?? [0]));
  const related = r?.payerForensics.filter((p) => p.fundedBySeller || p.fundedByLenderOperator).length ?? 0;

  return (
    <div className="space-y-4">
      <section className="panel edge p-6">
        <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-cyan">Seller</div>
        <h1 className="mono mt-2 break-all text-[20px] sm:text-[24px]">{address}</h1>
        <a className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-cyan" href={`${EXPLORER}/address/${address}`} target="_blank">
          View on Arc explorer <IExternal size={14} />
        </a>
      </section>

      {error && !data && <div className="alert alert-error text-[13px]">{error}</div>}
      {!data && !error && <div className="panel p-5 text-[13px] text-muted">Reading Arc and Circle Gateway…</div>}

      {data && (
        <>
          <div className={`alert ${data.lien.encumbered ? "alert-warning" : "alert-success"} !items-start !py-4`}>
            {data.lien.encumbered ? <IWarn size={26} className="mt-0.5 text-amber" /> : <ICheck size={26} className="mt-0.5 text-success" />}
            <div>
              <div className={`text-[16px] font-semibold ${data.lien.encumbered ? "text-amber" : "text-success"}`}>
                {data.lien.encumbered ? `Encumbered — lien #${data.lien.liveLienId}` : "Unencumbered"}
              </div>
              <p className="mt-0.5 text-[13px] text-white/80">
                {data.lien.encumbered
                  ? `${usd(data.lien.outstandingUsdc, 4)} outstanding. Revenue is pledged through splitter ${short(data.lien.splitter)}; no registered lender can open a second lien on this seller.`
                  : "No live lien in the Horos registry. Revenue is not pledged to any registered lender."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                <span className="chip text-white/85">{data.lien.record.opened} opened</span>
                <span className="chip text-success">{data.lien.record.repaid} repaid</span>
                <span className="chip text-danger">{data.lien.record.defaulted} defaulted</span>
                <span className="chip text-amber">{data.lien.record.frozenEvents} freezes</span>
              </div>
            </div>
          </div>

          {data.lien.liens.length > 0 && (
            <Panel title="Lien history">
              <div className="divide-y divide-line">
                {[...data.lien.liens].reverse().map((l) => (
                  <LienRow key={l.id} l={l} />
                ))}
              </div>
            </Panel>
          )}

          {r && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="x402 revenue"
                  value={usd(r.x402RevenueUsdc, 4)}
                  sub={`${r.x402Receipts} paid calls · ${r.historyHours >= 48 ? `${(r.historyHours / 24).toFixed(0)}d` : `${r.historyHours}h`} history`}
                  icon={<IBolt size={20} />}
                  spark={r.daily.map((d) => d.usdc)}
                />
                <Stat
                  label="Last 24h"
                  value={usd(r.last24hUsdc, 4)}
                  sub={`prev 24h ${usd(r.prev24hUsdc, 4)}`}
                  icon={<IChart size={20} />}
                  spark={[...r.hourly].sort((a, b) => b.hoursAgo - a.hoursAgo).map((h) => h.usdc)}
                />
                <Stat
                  label="Distinct payers"
                  value={String(r.distinctPayers)}
                  sub={`HHI ${r.payerHHI} · top ${(r.topPayerShare * 100).toFixed(0)}%`}
                  icon={<IUsers size={20} />}
                  tone="amber"
                />
                <Stat
                  label="Related-party payers"
                  value={String(related)}
                  sub={r.commonFunders.length ? `${r.commonFunders.length} shared non-public funder(s)` : "no shared private funders"}
                  icon={<IWarn size={20} />}
                  tone="amber"
                />
              </div>

              {r.bySettlement && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="panel p-4 text-[13px]">
                    <div className="text-muted">Exact (on-chain transferWithAuthorization)</div>
                    <div className="num mt-1 text-[18px] font-semibold">
                      {usd(r.bySettlement.exactOnChain.usdc, 4)} <span className="text-[13px] font-normal text-muted">· {r.bySettlement.exactOnChain.calls} calls</span>
                    </div>
                  </div>
                  <div className="panel p-4 text-[13px]">
                    <div className="text-muted">Circle Gateway (Nanopayments, batched)</div>
                    <div className="num mt-1 text-[18px] font-semibold">
                      {usd(r.bySettlement.gatewayBatched.usdc, 4)} <span className="text-[13px] font-normal text-muted">· {r.bySettlement.gatewayBatched.calls} calls</span>
                    </div>
                  </div>
                  <div className="panel edge edge-amber p-4 text-[13px]">
                    <div className="text-muted">Unsettled receivables (paid, not yet batched)</div>
                    <div className="num mt-1 text-[18px] font-semibold text-amber">{usd(r.unsettledReceivablesUsdc ?? 0, 4)}</div>
                  </div>
                </div>
              )}

              <Panel title="Revenue by hour" right={<span className="text-[12px] text-muted">last 48h</span>}>
                <div className="flex h-28 items-end gap-[3px]">
                  {Array.from({ length: 48 }, (_, i) => 47 - i).map((h) => {
                    const v = hourMap.get(h);
                    return (
                      <div
                        key={h}
                        title={v ? `${h}h ago: ${usd(v.usdc, 4)} · ${v.calls} calls` : `${h}h ago: none`}
                        className="flex-1 rounded-t-[3px]"
                        style={{
                          height: `${v ? Math.max(4, (v.usdc / maxHour) * 100) : 2}%`,
                          background: v ? "linear-gradient(180deg,#36d9e8,#0ea5b7)" : "rgba(27,40,56,.8)",
                          boxShadow: v ? "0 0 10px rgba(54,217,232,.45)" : "none",
                        }}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span>48h ago</span>
                  <span>now</span>
                </div>
              </Panel>

              <Panel title="Payer forensics" right={<span className="text-[12px] text-muted">is the revenue real?</span>}>
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead className="text-[12px] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-2 py-2 font-medium">Payer</th>
                        <th className="px-2 py-2 font-medium">Paid</th>
                        <th className="px-2 py-2 font-medium">Share</th>
                        <th className="px-2 py-2 font-medium">Wallet age</th>
                        <th className="px-2 py-2 font-medium">Funded by</th>
                        <th className="px-2 py-2 font-medium">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payerForensics.map((p) => (
                        <tr key={p.payer} className="border-b border-line last:border-0">
                          <td className="px-2 py-2.5"><Addr a={p.payer} /></td>
                          <td className="num px-2 py-2.5">
                            {usd(p.usdc, 4)} <span className="text-muted">· {p.calls}</span>
                          </td>
                          <td className="num px-2 py-2.5">{(p.share * 100).toFixed(0)}%</td>
                          <td className="num px-2 py-2.5">{p.walletAgeHours === null ? "—" : p.walletAgeHours >= 48 ? `${(p.walletAgeHours / 24).toFixed(0)}d` : `${p.walletAgeHours}h`}</td>
                          <td className="px-2 py-2.5"><Addr a={p.fundedBy} /></td>
                          <td className="px-2 py-2.5">
                            {p.fundedBySeller && <span className="chip mr-1 border-danger/50 text-danger">funded by seller</span>}
                            {p.fundedByLenderOperator && <span className="chip mr-1 border-amber/50 text-amber">funded by lender</span>}
                            {p.fundedByPublicFaucet && <span className="chip mr-1 text-info">public faucet</span>}
                            {!p.fundedBySeller && !p.fundedByLenderOperator && !p.fundedByPublicFaucet && <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
