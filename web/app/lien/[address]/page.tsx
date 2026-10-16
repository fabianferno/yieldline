"use client";
import { use } from "react";
import { usePoll, usd, short, EXPLORER } from "@/lib/api";
import { Addr, LienRow, Section, Stat, type Lien } from "@/components/ui";

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
    nonX402InflowsUsdc: number;
    historyHours: number;
    last24hUsdc: number;
    prev24hUsdc: number;
    distinctPayers: number;
    payerHHI: number;
    topPayerShare: number;
    interArrivalCv: number | null;
    avgTicketUsdc: number;
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
      activity: number;
    }[];
    payersFundedBySeller: number;
    commonFunders: { funder: string; payers: number }[];
  };
};

export default function SellerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const { data, error } = usePoll<SellerView>(`/api/seller/${address}`, 15000);
  const r = data?.revenue;
  const maxHour = Math.max(0.000001, ...(r?.hourly.map((h) => h.usdc) ?? [0]));

  return (
    <>
      <div className="engraved text-[11px] text-terra">Seller</div>
      <h1 className="num mt-1 break-all text-2xl">{address}</h1>
      <div className="mt-2 text-sm">
        <a className="text-ink-3 underline decoration-rule hover:text-terra" href={`${EXPLORER}/address/${address}`} target="_blank">
          view on Arc explorer
        </a>
      </div>
      {error && !data && <p className="mt-6 text-sm text-blood">{error}</p>}
      {!data && !error && <p className="mt-6 text-sm text-ink-3">Reading Arc…</p>}

      {data && (
        <>
          <div
            className={`mt-6 rounded-sm border p-4 ${data.lien.encumbered ? "border-terra/40 bg-terra/5" : "border-olive/30 bg-olive/5"}`}
          >
            <div className="font-serif text-2xl font-semibold">
              {data.lien.encumbered ? `Encumbered — lien #${data.lien.liveLienId}` : "Unencumbered"}
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {data.lien.encumbered
                ? `${usd(data.lien.outstandingUsdc, 4)} outstanding. Revenue is pledged through splitter ${short(data.lien.splitter)}; a registered lender cannot open a second lien on this seller.`
                : "No live lien in the Horos registry. Revenue is not pledged to any registered lender."}
            </p>
            <div className="num mt-2 text-xs text-ink-3">
              record: {data.lien.record.opened} opened · {data.lien.record.repaid} repaid · {data.lien.record.defaulted} defaulted ·{" "}
              {data.lien.record.frozenEvents} freezes
            </div>
          </div>

          {data.lien.liens.length > 0 && (
            <Section title="Lien history" kicker="Registry">
              <div className="rounded-sm border border-rule bg-card px-4">
                {[...data.lien.liens].reverse().map((l) => (
                  <LienRow key={l.id} l={l} />
                ))}
              </div>
            </Section>
          )}

          {r && (
            <>
              <Section title="x402 revenue" kicker="Receipts settled on Arc via transferWithAuthorization">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="x402 revenue" value={usd(r.x402RevenueUsdc, 4)} sub={`${r.x402Receipts} paid calls`} />
                  <Stat label="Last 24h" value={usd(r.last24hUsdc, 4)} sub={`prev 24h ${usd(r.prev24hUsdc, 4)}`} />
                  <Stat label="Distinct payers" value={String(r.distinctPayers)} sub={`HHI ${r.payerHHI} · top ${(r.topPayerShare * 100).toFixed(0)}%`} />
                  <Stat
                    label="Related-party payers"
                    value={String(r.payerForensics.filter((p) => p.fundedBySeller || p.fundedByLenderOperator).length)}
                    tone={r.payerForensics.some((p) => p.fundedBySeller) ? "blood" : undefined}
                    sub={r.commonFunders.length ? `${r.commonFunders.length} shared funder(s)` : "no shared funders"}
                  />
                </div>
                {r.hourly.length > 0 && (
                  <div className="mt-4 rounded-sm border border-rule bg-card p-4">
                    <div className="engraved mb-2 text-[10px] text-ink-3">Revenue by hour (last 48h)</div>
                    <div className="flex h-24 items-end gap-[2px]">
                      {Array.from({ length: 48 }, (_, i) => 47 - i).map((h) => {
                        const v = r.hourly.find((x) => x.hoursAgo === h);
                        return (
                          <div
                            key={h}
                            title={v ? `${h}h ago: ${usd(v.usdc, 4)} · ${v.calls} calls` : `${h}h ago: none`}
                            className="flex-1 rounded-t-sm bg-terra/80"
                            style={{ height: `${v ? Math.max(4, (v.usdc / maxHour) * 100) : 0}%` }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink-3">
                      <span>48h ago</span>
                      <span>now</span>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Payer forensics" kicker="Is the revenue real?">
                <div className="overflow-x-auto rounded-sm border border-rule bg-card">
                  <table className="w-full text-left text-sm">
                    <thead className="engraved text-[10px] text-ink-3">
                      <tr className="border-b border-rule">
                        <th className="px-3 py-2">Payer</th>
                        <th className="px-3 py-2">Paid</th>
                        <th className="px-3 py-2">Share</th>
                        <th className="px-3 py-2">Wallet age</th>
                        <th className="px-3 py-2">Funded by</th>
                        <th className="px-3 py-2">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payerForensics.map((p) => (
                        <tr key={p.payer} className="border-b border-rule/60 last:border-0">
                          <td className="px-3 py-2"><Addr a={p.payer} /></td>
                          <td className="num px-3 py-2">{usd(p.usdc, 4)} <span className="text-ink-3">· {p.calls}</span></td>
                          <td className="num px-3 py-2">{(p.share * 100).toFixed(0)}%</td>
                          <td className="num px-3 py-2">{p.walletAgeHours === null ? "—" : `${p.walletAgeHours}h`}</td>
                          <td className="px-3 py-2"><Addr a={p.fundedBy} /></td>
                          <td className="px-3 py-2 text-xs">
                            {p.fundedBySeller && <span className="text-blood">funded by seller </span>}
                            {p.fundedByLenderOperator && <span className="text-ochre">funded by lender </span>}
                            {!p.fundedBySeller && !p.fundedByLenderOperator && <span className="text-ink-3">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
        </>
      )}
    </>
  );
}
