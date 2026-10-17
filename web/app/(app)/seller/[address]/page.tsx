"use client";
import { use } from "react";
import { usePoll, usd, short, EXPLORER } from "@/lib/api";
import { Addr, DecisionEntry, LienCard, LienRow, Metric, Panel, Skeleton, type FeedItem, type Lien } from "@/components/ui";
import { ICheck, IExternal, IWarn } from "@/components/icons";

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

const span = (h: number) => (h >= 48 ? `${(h / 24).toFixed(0)} days` : `${h.toFixed(h < 10 ? 1 : 0)} hours`);

export default function SellerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const { data, error } = usePoll<SellerView>(`/api/seller/${address}`, 15000);
  const { data: ov } = usePoll<{ feed: FeedItem[] }>("/api/overview", 15000);
  const r = data?.revenue;
  const verdict = ov?.feed.find((f) => f.decision && f.decision.agent !== "monitor" && f.decision.agent !== "treasury" && f.args.subject?.toLowerCase() === address.toLowerCase());
  const live = data?.lien.liens.filter((l) => l.status === "Active" || l.status === "Frozen") ?? [];
  const past = data?.lien.liens.filter((l) => !live.includes(l)) ?? [];

  return (
    <div className="space-y-5">
      <section id="tour-pledge" className="panel edge p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Seller</h1>
          {data &&
            (data.lien.encumbered ? (
              <span className="chip border-amber/50 text-amber">
                <IWarn size={13} /> Revenue pledged · advance #{data.lien.liveLienId}
              </span>
            ) : (
              <span className="chip border-success/40 text-success">
                <ICheck size={13} /> Revenue not pledged
              </span>
            ))}
        </div>
        <div className="mono mt-2 break-all text-[14px] text-ice sm:text-[16px]">{address}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          {data && (
            <span className="num">
              {data.lien.record.opened} opened · {data.lien.record.repaid} repaid · {data.lien.record.defaulted} defaulted · {data.lien.record.frozenEvents} freezes
            </span>
          )}
          <a className="inline-flex items-center gap-1 hover:text-cyan" href={`${EXPLORER}/address/${address}`} target="_blank">
            Arc explorer <IExternal size={13} />
          </a>
        </div>
        {data && (
          <p className="mt-4 max-w-[72ch] text-[13px] leading-relaxed text-white/75">
            {data.lien.encumbered
              ? `${usd(data.lien.outstandingUsdc, 4)} is outstanding. This seller's revenue is pledged through splitter ${short(data.lien.splitter)}, so no registered lender can advance against it again until this one is repaid.`
              : "Nothing open in the Yieldline registry. This seller's revenue is not pledged to any registered lender."}
          </p>
        )}
      </section>

      {error && !data && <div className="alert alert-error text-[13px]">Couldn&apos;t read this seller: {error}. Retrying.</div>}

      <Panel id="tour-verdict" title="Underwriter's verdict" right={verdict ? "most recent decision on this seller" : undefined}>
        {!ov ? (
          <Skeleton rows={2} />
        ) : verdict ? (
          <div className="-my-4">
            <DecisionEntry f={verdict} />
          </div>
        ) : (
          <p className="text-[13px] text-muted">The underwriter hasn&apos;t assessed this seller yet. The forensics below are what it would read.</p>
        )}
      </Panel>

      {!data && !error && (
        <Panel>
          <p className="mb-3 text-[13px] text-muted">Reading Arc and Circle Gateway…</p>
          <Skeleton rows={4} />
        </Panel>
      )}

      {live.length > 0 && (
        <Panel title="Active advance" right="pays itself back from each sale">
          {live.map((l) => (
            <LienCard key={l.id} l={l} sellerLink={false} />
          ))}
        </Panel>
      )}
      {past.length > 0 && (
        <Panel title="Past advances">
          <div className="divide-y divide-line">
            {[...past].reverse().map((l) => (
              <LienRow key={l.id} l={l} />
            ))}
          </div>
        </Panel>
      )}

      {r && <Revenue r={r} />}
      {r && <Forensics r={r} />}
    </div>
  );
}

function Revenue({ r }: { r: SellerView["revenue"] }) {
  const window = Math.min(48, Math.max(12, Math.ceil(r.historyHours) + 2));
  const hourMap = new Map(r.hourly.map((h) => [h.hoursAgo, h]));
  const maxHour = Math.max(1e-9, ...r.hourly.filter((h) => h.hoursAgo < window).map((h) => h.usdc));
  const exact = r.bySettlement?.exactOnChain;
  const gw = r.bySettlement?.gatewayBatched;
  const total = (exact?.usdc ?? 0) + (gw?.usdc ?? 0) || 1;
  const delta = r.prev24hUsdc > 0 ? ((r.last24hUsdc - r.prev24hUsdc) / r.prev24hUsdc) * 100 : null;

  return (
    <Panel title="x402 revenue" right={`${span(r.historyHours)} of history`}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <Metric label="Total" value={usd(r.x402RevenueUsdc, 2)} sub={`${r.x402Receipts.toLocaleString()} paid calls · avg ${usd(r.avgTicketUsdc, 4)}`} />
        <Metric
          label="Last 24 hours"
          value={usd(r.last24hUsdc, 2)}
          tone="cyan"
          sub={delta === null ? "no prior day to compare" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs previous 24h`}
        />
        <Metric label="Distinct payers" value={String(r.distinctPayers)} sub={`top payer ${(r.topPayerShare * 100).toFixed(0)}% · HHI ${r.payerHHI}`} />
        <Metric
          label="Unsettled receivables"
          value={usd(r.unsettledReceivablesUsdc ?? 0, 2)}
          tone="amber"
          sub="paid via Gateway, not yet batched"
        />
      </div>

      {r.bySettlement && (
        <div className="mt-6">
          <div className="mb-2 text-[12px] text-muted">How it settled</div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-glass">
            {exact!.usdc > 0 && <div className="bg-cyan" style={{ width: `${(exact!.usdc / total) * 100}%` }} />}
            {gw!.usdc > 0 && <div className="bg-amber" style={{ width: `${(gw!.usdc / total) * 100}%` }} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan" />
              <span className="text-white/75">On-chain exact</span>
              <span className="num">{usd(exact!.usdc, 2)} · {exact!.calls} calls</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber" />
              <span className="text-white/75">Circle Gateway, batched</span>
              <span className="num">{usd(gw!.usdc, 2)} · {gw!.calls} calls</span>
            </span>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex justify-between text-[12px] text-muted">
          <span>By hour</span>
          <span>last {window}h</span>
        </div>
        <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`Hourly x402 revenue over the last ${window} hours`}>
          {Array.from({ length: window }, (_, i) => window - 1 - i).map((h) => {
            const v = hourMap.get(h);
            return (
              <div
                key={h}
                title={v ? `${h}h ago: ${usd(v.usdc, 4)} · ${v.calls} calls` : `${h}h ago: no revenue`}
                className="flex-1 rounded-t-[3px]"
                style={{
                  height: `${v ? Math.max(4, (v.usdc / maxHour) * 100) : 2}%`,
                  background: v ? "linear-gradient(180deg,#ff4545,#c81e2a)" : "rgba(35,35,39,.8)",
                }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{window}h ago</span>
          <span>now</span>
        </div>
      </div>
    </Panel>
  );
}

function Forensics({ r }: { r: SellerView["revenue"] }) {
  const P = r.payerForensics;
  const bySeller = P.filter((p) => p.fundedBySeller).length;
  const byLender = P.filter((p) => p.fundedByLenderOperator).length;
  const faucet = P.filter((p) => p.fundedByPublicFaucet).length;
  const clean = bySeller === 0 && r.commonFunders.length === 0;
  return (
    <Panel title="Payer forensics" right="who is actually paying, and who funded them">
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3.5 text-[13px] ${clean ? "border-success/30 bg-success/5" : "border-amber/40 bg-amber/5"}`}>
        {clean ? <ICheck size={18} className="mt-0.5 shrink-0 text-success" /> : <IWarn size={18} className="mt-0.5 shrink-0 text-amber" />}
        <p className="leading-relaxed text-white/85">
          {P.length} payers checked.{" "}
          {bySeller > 0 && <span className="text-danger">{bySeller} were funded by the seller itself. </span>}
          {byLender > 0 && <span className="text-amber">{byLender} were funded by the lender&apos;s own operator. </span>}
          {faucet > 0 && <span>{faucet} were funded from the public Circle faucet, which is neutral. </span>}
          {r.commonFunders.length > 0
            ? `${r.commonFunders.length} private wallet${r.commonFunders.length > 1 ? "s" : ""} funded more than one payer.`
            : "No private wallet funded more than one payer."}
        </p>
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="text-[12px] text-muted">
            <tr className="border-b border-line">
              <th className="px-2 py-2 font-medium">Payer</th>
              <th className="px-2 py-2 text-right font-medium">Paid</th>
              <th className="px-2 py-2 text-right font-medium">Calls</th>
              <th className="px-2 py-2 text-right font-medium">Share</th>
              <th className="px-2 py-2 text-right font-medium">Wallet age</th>
              <th className="px-2 py-2 font-medium">Funded by</th>
              <th className="px-2 py-2 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {P.map((p) => (
              <tr key={p.payer} className="border-b border-line last:border-0 hover:bg-glass/30">
                <td className="px-2 py-2.5"><Addr a={p.payer} /></td>
                <td className="num px-2 py-2.5 text-right">{usd(p.usdc, 2)}</td>
                <td className="num px-2 py-2.5 text-right text-white/75">{p.calls}</td>
                <td className="num px-2 py-2.5 text-right">{(p.share * 100).toFixed(0)}%</td>
                <td className="num px-2 py-2.5 text-right text-white/75">
                  {p.walletAgeHours === null ? "—" : p.walletAgeHours >= 48 ? `${(p.walletAgeHours / 24).toFixed(0)}d` : `${p.walletAgeHours}h`}
                </td>
                <td className="px-2 py-2.5"><Addr a={p.fundedBy} /></td>
                <td className="px-2 py-2.5">
                  {p.fundedBySeller ? (
                    <span className="chip border-danger/50 text-danger">seller-funded</span>
                  ) : p.fundedByLenderOperator ? (
                    <span className="chip border-amber/50 text-amber">lender-funded</span>
                  ) : p.fundedByPublicFaucet ? (
                    <span className="chip text-info">public faucet</span>
                  ) : (
                    <span className="text-muted">no flag</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
