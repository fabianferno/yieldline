"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { API, EXPLORER, usePoll, usd, short } from "@/lib/api";
import { signedPost, post } from "@/lib/signed";
import { pct, type Account, type Offer, type PoolMatch } from "@/lib/types";
import { useWallet } from "@/lib/wallet";
import { NeedsAccount } from "@/components/Connect";
import { Addr, LienCard, Panel, Skeleton } from "@/components/ui";
import { IArrow, ICheck } from "@/components/icons";

const LIVE: Offer["status"][] = ["underwriting", "offered", "accepted", "pending_human", "funded"];

export default function Borrow() {
  const w = useWallet();
  const { data: acct, error } = usePoll<Account>(w.address ? `/api/accounts/${w.address}` : null, 4000);
  const [fresh, setFresh] = useState(false);
  const [openId, setOpenId] = useState<string>();

  if (w.status !== "ready") return <NeedsAccount what="apply for working capital" />;

  const offers = acct?.offers ?? [];
  const current = openId ? offers.find((o) => o.id === openId) : offers.find((o) => LIVE.includes(o.status) && !(o.status === "funded" && lienClosed(o, acct)));
  const showApply = fresh || (acct && !current);

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Working capital for your x402 business</h1>
        <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-white/75">
          The Horos agent reads your x402 revenue on Arc and offers an advance in USDC. You repay with a fixed share of each incoming payment,
          automatically, until the advance plus a flat fee is paid. No credit check, no collateral beyond the revenue itself.
        </p>
        <Steps current={showApply ? 0 : stepOf(current?.status)} />
      </section>

      {error && !acct && <div className="alert alert-error text-[13px]">Can&apos;t reach the Horos API: {error}</div>}
      {!acct ? (
        <Panel>
          <Skeleton rows={3} />
        </Panel>
      ) : showApply ? (
        <Apply
          onCancel={current ? () => setFresh(false) : undefined}
          onApplied={(id) => {
            setFresh(false);
            setOpenId(id);
          }}
        />
      ) : current ? (
        <OfferView o={current} acct={acct} onNew={() => setFresh(true)} />
      ) : null}

      {acct && offers.length > 1 && (
        <Panel title="Your applications">
          <ul className="divide-y divide-line text-[13px]">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="mono text-muted">{o.id}</span>
                <span className="flex-1 truncate text-white/80">{o.endpoint}</span>
                <span className="chip">{statusLabel(o.status)}</span>
                {o.id !== current?.id && (
                  <button className="text-cyan underline underline-offset-4" onClick={() => setOpenId(o.id)}>
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function lienClosed(o: Offer, acct?: Account | null) {
  const info = acct?.liens.find((l) => l.seller.toLowerCase() === o.seller.toLowerCase());
  const l = info?.liens.find((x) => x.id === o.lienId);
  return !!l && (l.status === "Repaid" || l.status === "Defaulted");
}

const STEPS = ["Apply", "Agent review", "Choose a pool", "Route payments", "Funded"];
function stepOf(s?: Offer["status"]) {
  return s === "underwriting" ? 1 : s === "offered" ? 2 : s === "accepted" ? 3 : s === "funded" || s === "pending_human" ? 4 : 1;
}
const statusLabel = (s: Offer["status"]) =>
  ({ underwriting: "Under review", failed: "Failed", offered: "Offer ready", accepted: "Waiting for payTo", funded: "Funded", rejected: "Declined", pending_human: "With a reviewer" })[s];

function Steps({ current }: { current: number }) {
  return (
    <ol className="mt-6 flex flex-wrap gap-x-2 gap-y-2 border-t border-line pt-4 text-[12px]">
      {STEPS.map((s, i) => (
        <li key={s} className={`flex items-center gap-2 ${i === current ? "text-white" : i < current ? "text-success" : "text-muted"}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full border ${i === current ? "border-cyan text-cyan" : i < current ? "border-success/60" : "border-line"}`}>
            {i < current ? <ICheck size={11} /> : i + 1}
          </span>
          {s}
          {i < STEPS.length - 1 && <span className="mx-1 text-muted/50">—</span>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- 1. apply

type Probe = { ok: boolean; payTo?: string; status?: number; error?: string; amount?: string };

function Apply({ onApplied, onCancel }: { onApplied: (id: string) => void; onCancel?: () => void }) {
  const w = useWallet();
  const [endpoint, setEndpoint] = useState("");
  const [payout, setPayout] = useState("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const check = async () => {
    if (!/^https?:\/\//.test(endpoint)) return;
    setProbing(true);
    try {
      const r = await fetch(`${API}/api/probe?url=${encodeURIComponent(endpoint)}`);
      const p: Probe = await r.json();
      setProbe(p);
      if (p.ok && p.payTo && !payout) setPayout(p.payTo);
    } catch (e: any) {
      setProbe({ ok: false, error: e?.message });
    } finally {
      setProbing(false);
    }
  };

  const submit = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      const r = await signedPost<{ id: string }>(
        "/api/applications",
        { action: "apply", subject: endpoint, account: w.address!, sign: w.signMessage },
        { endpoint, payout },
      );
      onApplied(r.id);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Apply" right="takes about a minute">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-muted">Your x402 endpoint</span>
          <input
            className="input mt-1 w-full"
            placeholder="https://api.example.com/v1/paid-route"
            value={endpoint}
            onChange={(e) => {
              setEndpoint(e.target.value.trim());
              setProbe(null);
            }}
            onBlur={check}
          />
          <span className="mt-1 block min-h-[18px] text-[12px]">
            {probing ? (
              <span className="text-muted">Checking the endpoint…</span>
            ) : probe?.ok ? (
              <span className="text-success">
                Answers with an x402 challenge · payTo <span className="mono">{short(probe.payTo)}</span>
              </span>
            ) : probe ? (
              <span className="text-danger">No x402 challenge here ({probe.status ? `HTTP ${probe.status}` : probe.error}). Use a route that asks buyers to pay.</span>
            ) : (
              <span className="text-muted">A route that returns HTTP 402 to unpaid requests.</span>
            )}
          </span>
        </label>
        <label className="block">
          <span className="text-[12px] text-muted">Address that receives your revenue</span>
          <input className="input mono mt-1 w-full" placeholder="0x…" value={payout} onChange={(e) => setPayout(e.target.value.trim())} />
          <span className="mt-1 block text-[12px] text-muted">The agent reads revenue paid to this address. The advance is sent here too.</span>
        </label>
      </div>
      <div className="mt-4 rounded-xl border border-line p-3.5 text-[12px] leading-relaxed text-white/75">
        You sign once with your passkey to submit. The agent checks your receipts, who pays you, whether your revenue is already pledged, and
        your live endpoint, then writes its decision and reasoning on Arc. Revenue paid by wallets you funded yourself does not count.
      </div>
      {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={busy || !probe?.ok || !/^0x[0-9a-fA-F]{40}$/.test(payout)} onClick={submit}>
          {busy ? "Confirm with your passkey…" : "Submit for review"} <IArrow size={16} />
        </button>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Back to my application
          </button>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- 2-5

function OfferView({ o, acct, onNew }: { o: Offer; acct: Account; onNew: () => void }) {
  if (o.status === "underwriting") return <Underwriting o={o} />;
  if (o.status === "failed")
    return (
      <Panel title="The review could not finish">
        <p className="text-[13px] text-danger">{o.error}</p>
        <button className="btn btn-primary mt-4" onClick={onNew}>
          Apply again
        </button>
      </Panel>
    );
  return (
    <div className="space-y-5">
      <Verdict o={o} onNew={onNew} />
      {o.status === "offered" && <ChoosePool o={o} />}
      {o.status === "accepted" && <WireSplitter o={o} />}
      {(o.status === "funded" || (o.status === "pending_human" && o.proposalId !== undefined)) && <Line o={o} acct={acct} />}
    </div>
  );
}

function Underwriting({ o }: { o: Offer }) {
  const { data } = usePoll<Offer>(`/api/applications/${o.id}`, 2000);
  const steps = (data ?? o).trace ?? [];
  return (
    <Panel title="The agent is reviewing your revenue" right={<span className="chip text-amber"><span className="pulse h-1.5 w-1.5 rounded-full bg-current" />working</span>}>
      <ol className="space-y-2.5 text-[13px]">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 text-success">
              <ICheck size={14} />
            </span>
            <span className="text-white/85">{s.summary}</span>
          </li>
        ))}
        <li className="flex gap-3 text-muted">
          <span className="pulse mt-1.5 h-2 w-2 rounded-full bg-cyan" />
          Deciding…
        </li>
      </ol>
    </Panel>
  );
}

function Verdict({ o, onNew }: { o: Offer; onNew: () => void }) {
  const tone = o.decision === "offer" ? "text-success" : o.decision === "reject" ? "text-danger" : "text-amber";
  const head =
    o.status === "rejected"
      ? "The agent declined this application"
      : o.status === "pending_human" && o.proposalId === undefined
        ? "Sent to a human reviewer"
        : "Offer";
  const cap = o.advanceUsdc * (1 + o.feeBps / 10_000);
  return (
    <Panel title={<span className={tone}>{head}</span>} right={o.decisionHash ? <span className="mono">decision {o.decisionHash.slice(0, 10)}</span> : undefined}>
      {o.decision !== "reject" && o.advanceUsdc > 0 && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Term k="Advance" v={usd(o.advanceUsdc, 2)} />
          <Term k="You repay" v={usd(cap, 4)} sub={`flat fee ${pct(o.feeBps)}`} />
          <Term k="Taken from each payment" v={pct(o.sweepBps)} sub="until repaid" />
          <Term k="Term" v={`${o.termDays} days`} sub={`risk score ${o.riskScore}`} />
        </dl>
      )}
      <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-white/80">{o.rationale}</p>
      {!!o.flags?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {o.flags.slice(0, 8).map((f) => (
            <span key={f} className="chip text-muted">
              {f.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
      {o.status === "pending_human" && o.proposalId === undefined && (
        <p className="mt-3 text-[13px] text-amber">The evidence was ambiguous, so a person reviews it before any offer is made. Check back here.</p>
      )}
      {o.status === "rejected" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" onClick={onNew}>
            Apply again later
          </button>
          <span className="text-[12px] text-muted">More history from more independent buyers is what changes this answer.</span>
        </div>
      )}
    </Panel>
  );
}

function Term({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="num mt-1 text-[20px] font-semibold tracking-tight">{v}</dd>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

function ChoosePool({ o }: { o: Offer }) {
  const w = useWallet();
  const { data } = usePoll<{ matches: PoolMatch[] }>(`/api/offers/${o.id}/pools`, 10000);
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const eligible = data?.matches.filter((m) => m.eligible) ?? [];
  const other = data?.matches.filter((m) => !m.eligible) ?? [];

  const accept = async (pool: string) => {
    setErr(undefined);
    setBusy(pool);
    try {
      await signedPost("/api/offers/" + o.id + "/accept", { action: "accept", subject: o.id, account: w.address!, sign: w.signMessage }, { pool });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Panel title="Choose a pool" right="pools whose rules fit this offer">
      {!data ? (
        <Skeleton rows={2} />
      ) : (
        <>
          {eligible.length === 0 && (
            <p className="text-[13px] text-amber">No pool can fund this right now. Pools add cash as lenders deposit and advances are repaid; this list updates live.</p>
          )}
          <ul className="space-y-3">
            {eligible.map((m) => (
              <li key={m.pool} className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[12px] text-muted">
                    {usd(m.liquidityUsdc, 2)} free{m.needsCuratorApproval ? " · the curator approves this size by hand" : " · funds automatically"}
                  </div>
                </div>
                <button className="btn btn-primary" disabled={!!busy} onClick={() => accept(m.pool)}>
                  {busy === m.pool ? "Confirm with your passkey…" : "Borrow from this pool"}
                </button>
              </li>
            ))}
          </ul>
          {other.length > 0 && (
            <details className="mt-4 text-[12px] text-muted">
              <summary className="cursor-pointer">Pools that can&apos;t fund this ({other.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {other.map((m) => (
                  <li key={m.pool}>
                    <span className="text-white/80">{m.name}:</span> {m.reasons.join(" ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}
        </>
      )}
    </Panel>
  );
}

function WireSplitter({ o }: { o: Offer }) {
  const [state, setState] = useState<{ wired?: boolean; livePayTo?: string | null; funded?: boolean }>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await post<{ wired?: boolean; livePayTo?: string | null; funded?: boolean }>(`/api/offers/${o.id}/fund`);
        if (alive) setState(r);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [o.id]);

  const snippet = `// @x402/express: point payTo at your Horos splitter
paymentMiddleware(
  {
    "GET /your-paid-route": {
      accepts: [{ scheme: "exact", price: "$0.01", network: "eip155:5042002", payTo: "${o.splitter}" }],
    },
  },
  server,
);`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(o.splitter!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Panel title="Route your payments through the splitter" right={<Addr a={o.splitter} />}>
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-white/80">
        Set <span className="mono text-ice">payTo</span> on your x402 endpoint to your splitter. Each payment then splits on arrival:{" "}
        {pct(o.sweepBps)} repays the advance, the rest is forwarded to <span className="mono">{short(o.seller)}</span>. The USDC is sent as soon as
        your live endpoint shows the splitter.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="mono rounded-lg border border-line bg-midnight/60 px-3 py-2 text-[12px] text-ice">{o.splitter}</code>
        <button className="btn btn-ghost !h-9" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mono mt-4 overflow-x-auto rounded-xl border border-line bg-midnight/60 p-4 text-[12px] leading-relaxed text-white/85">{snippet}</pre>
      <div className="mt-4 flex items-center gap-3 text-[13px]" aria-live="polite">
        {state.funded ? (
          <span className="text-success">Funded. Refreshing…</span>
        ) : state.wired ? (
          <span className="text-success">Your endpoint names the splitter. Sending the advance…</span>
        ) : (
          <>
            <span className="pulse h-2 w-2 rounded-full bg-amber" />
            <span className="text-white/80">
              Watching {o.endpoint}: payTo is currently <span className="mono">{state.livePayTo ? short(state.livePayTo) : "…"}</span>
            </span>
          </>
        )}
      </div>
    </Panel>
  );
}

function Line({ o, acct }: { o: Offer; acct: Account }) {
  const info = acct.liens.find((l) => l.seller.toLowerCase() === o.seller.toLowerCase());
  const lien = info?.liens.find((l) => l.id === o.lienId) ?? info?.liens.find((l) => l.id === info.liveLienId);
  if (o.status === "pending_human")
    return (
      <Panel title="Waiting for the pool's curator">
        <p className="text-[13px] leading-relaxed text-white/80">
          This advance is above the pool&apos;s auto-approve limit, so its curator approves it by hand. Nothing else is needed from you; payments
          already route through your splitter.
        </p>
      </Panel>
    );
  return (
    <Panel title="Your line" right={o.txs?.advance && <a className="underline underline-offset-4" href={`${EXPLORER}/tx/${o.txs.advance}`} target="_blank">advance transaction</a>}>
      {lien ? <LienCard l={lien} sellerLink={false} /> : <Skeleton rows={2} />}
      <p className="mt-4 text-[12px] text-muted">
        The Horos monitor checks your endpoint and repayment pace. If payTo stops naming the splitter, the line is frozen and 100% of anything that
        still arrives repays the advance. Public record:{" "}
        <Link className="text-cyan underline underline-offset-4" href={`/seller/${o.seller}`}>
          {short(o.seller)}
        </Link>
      </p>
    </Panel>
  );
}
