"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, useScroll, useSpring } from "motion/react";
import { API, EXPLORER, ago, short, usePoll, usd } from "@/lib/api";
import { IArrow, IExternal, PrismCube } from "@/components/icons";
import { EASE, Num } from "@/components/motion";
import type { FeedItem, Lien } from "@/components/ui";

type Overview = {
  addresses: { registry: string; pool: string; teller: string };
  pool: { navUsdc: number; idleInUsycUsdc: number; limits: Record<string, number> };
  liens: Lien[];
  metrics: Record<string, number>;
  feed: FeedItem[];
};

const SUBJECT = "0xa8904aaa5ef379ccad3edad0c8545fb0951d6466";
const ENDPOINT = `/v1/credit/${SUBJECT}`;

/** Read the real 402 challenge from the Horos Lien Oracle. */
function useChallenge() {
  const [c, setC] = useState<{ payTo: string; amount: number; network: string; live: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}${ENDPOINT}`)
      .then((r) => {
        const h = r.headers.get("payment-required");
        if (r.status !== 402 || !h) throw new Error("no challenge");
        const j = JSON.parse(atob(h));
        const a = (j.accepts ?? [j])[0];
        if (alive) setC({ payTo: a.payTo, amount: Number(a.amount ?? a.maxAmountRequired) / 1e6, network: a.network, live: true });
      })
      .catch(() => alive && setC({ payTo: "", amount: 0.02, network: "eip155:5042002", live: false }));
    return () => {
      alive = false;
    };
  }, []);
  return c;
}

export default function Landing() {
  const { data } = usePoll<Overview>("/api/overview", 12000);
  const lien = data?.liens.find((l) => l.status === "Active" || l.status === "Frozen") ?? data?.liens[0];
  const m = data?.metrics;

  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(700px_420px_at_75%_20%,rgba(54,217,232,0.10),transparent_70%),radial-gradient(500px_360px_at_95%_60%,rgba(255,182,92,0.07),transparent_70%)]" />

      <SiteNav />

      {/* First viewport: the offer, and the exchange playing against the real endpoint */}
      <section className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:pt-16">
        <div>
          <motion.h1
            initial={{ opacity: 0.2, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="max-w-[16ch] text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] text-balance sm:text-[56px]"
          >
            Credit for x402 sellers, repaid by the payments themselves.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0.2, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/75"
          >
            Horos advances USDC against revenue it can verify on Arc. The seller points <span className="mono text-ice">payTo</span> at a splitter,
            and every paid call pays down the advance on arrival. Each advance is a public lien, and every agent decision is published with its
            reasoning.
          </motion.p>
          <motion.div
            initial={{ opacity: 0.2, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link href="/ledger" className="btn btn-primary btn-lg">
              Open the live ledger <IArrow size={17} />
            </Link>
            <Link href="/explorer" className="btn btn-ghost btn-lg">
              Look up a seller
            </Link>
          </motion.div>
          <dl className="mt-10 grid max-w-[520px] grid-cols-3 gap-6 border-t border-line pt-6">
            <Fact label="Advanced" value={<Num value={m?.advancedUsdc} format={(n) => usd(n, 2)} />} />
            <Fact label="Repaid by sweeps" value={<Num value={m?.repaidViaSweepsUsdc} format={(n) => usd(n, 2)} />} tone="text-cyan" />
            <Fact label="Agent decisions" value={<Num value={m?.decisions} format={(n) => String(Math.round(n))} />} />
          </dl>
          <p className="mt-3 text-[12px] text-muted">Live from Arc testnet. USDC moved on chain, not simulated.</p>
        </div>

        <Exchange lien={lien} latestSweep={data?.feed.find((f) => f.event === "LienRepayment")} />
      </section>

      <Loop data={data} lien={lien} />
      <Guardrails limits={data?.pool.limits} />
      <Close addresses={data?.addresses} />
    </div>
  );
}

function SiteNav() {
  return (
    <header className="relative z-10 mx-auto flex max-w-[1240px] items-center gap-6 px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <PrismCube size={34} />
        <span className="text-[19px] font-semibold tracking-tight">Horos</span>
      </Link>
      <nav className="ml-auto flex items-center gap-1 text-[13px] text-white/75 max-sm:hidden">
        <a href="#loop" className="rounded-lg px-3 py-2 hover:text-white">How it works</a>
        <a href="#limits" className="rounded-lg px-3 py-2 hover:text-white">Limits</a>
        <a href="https://github.com/sirbadenpowell/horos" target="_blank" className="rounded-lg px-3 py-2 hover:text-white">GitHub</a>
      </nav>
      <Link href="/ledger" className="btn btn-primary max-sm:ml-auto">
        Ledger <IArrow size={15} />
      </Link>
    </header>
  );
}

function Fact({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`num mt-1 text-[22px] font-semibold tracking-tight ${tone}`}>{value}</dd>
    </div>
  );
}

/* ---------------- The exchange: the page's one authored sequence ---------------- */

const STEPS = 6;

function Exchange({ lien, latestSweep }: { lien?: Lien; latestSweep?: FeedItem }) {
  const challenge = useChallenge();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!challenge) return;
    if (reduce) {
      setStep(STEPS);
      return;
    }
    if (!inView) return;
    setStep(0);
    const timers = Array.from({ length: STEPS }, (_, i) => setTimeout(() => setStep(i + 1), 350 + i * 700));
    const again = setTimeout(() => setRun((r) => r + 1), 350 + STEPS * 700 + 6000);
    return () => [...timers, again].forEach(clearTimeout);
  }, [challenge, inView, reduce, run]);

  const sweepPct = (lien?.sweepBps ?? 3000) / 100;
  const amount = challenge?.amount ?? 0.02;
  const toPool = (amount * sweepPct) / 100;
  const isLien = !!challenge?.payTo && !!lien && challenge.payTo.toLowerCase() === lien.payTo.toLowerCase();

  return (
    <div ref={ref} className="panel edge relative overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[12px]">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-2 text-white/80">A lender asks the Horos Lien Oracle about a seller</span>
        <button onClick={() => setRun((r) => r + 1)} className="ml-auto text-muted hover:text-cyan" aria-label="Replay the exchange">
          Replay
        </button>
      </div>

      <div className="mono space-y-4 p-4 text-[12.5px] leading-relaxed sm:p-5">
        <Line show={step >= 1}>
          <span className="text-cyan">GET</span> {ENDPOINT.replace(SUBJECT, short(SUBJECT))} <span className="text-muted">HTTP/1.1</span>
          <div className="text-muted">Host: horos-api.vercel.app</div>
        </Line>

        <Line show={step >= 2}>
          <div>
            <span className="text-muted">HTTP/1.1</span> <span className="text-amber">402 Payment Required</span>
          </div>
          <div className="mt-1.5 rounded-lg border border-line bg-midnight/50 p-3">
            <div className="mb-1.5 text-[11px] text-muted">PAYMENT-REQUIRED (decoded)</div>
            <KV k="scheme" v="exact" />
            <KV k="network" v={`${challenge?.network ?? "eip155:5042002"} · Arc testnet`} />
            <KV k="amount" v={`${amount} USDC`} />
            <KV
              k="payTo"
              v={
                <span>
                  {challenge?.payTo ? short(challenge.payTo) : "—"}{" "}
                  {isLien && <span className="font-sans text-[11px] text-cyan">← splitter for lien #{lien!.id}</span>}
                </span>
              }
            />
          </div>
        </Line>

        <Line show={step >= 3}>
          <span className="text-cyan">GET</span> {ENDPOINT.replace(SUBJECT, short(SUBJECT))}
          <div className="text-muted">
            PAYMENT-SIGNATURE: <span className="text-white/85">transferWithAuthorization</span>, signed by the buyer
          </div>
        </Line>

        <Line show={step >= 4}>
          <span className="text-muted">HTTP/1.1</span> <span className="text-success">200 OK</span>
          <div className="text-muted">PAYMENT-RESPONSE: settled on Arc, {amount} USDC to the splitter</div>
        </Line>

        <Line show={step >= 5}>
          <div className="font-sans">
            <div className="mb-2 flex justify-between text-[12px] text-white/80">
              <span>The splitter divides it on arrival</span>
              <span className="text-muted">split() is permissionless</span>
            </div>
            <div className="relative flex h-9 overflow-hidden rounded-lg text-[12px] font-medium">
              <motion.div
                className="flex items-center justify-center bg-gradient-to-r from-cyan to-cyan-deep text-midnight"
                initial={{ flexGrow: 0.0001 }}
                animate={{ flexGrow: step >= 5 ? sweepPct : 0.0001 }}
                transition={{ duration: 0.8, ease: EASE }}
                style={{ flexBasis: 0 }}
              >
                {usd(toPool, 4)} to pool
              </motion.div>
              <motion.div
                className="flex items-center justify-center bg-glass text-amber"
                initial={{ flexGrow: 0.0001 }}
                animate={{ flexGrow: step >= 6 ? 100 - sweepPct : 0.0001 }}
                transition={{ duration: 0.8, ease: EASE }}
                style={{ flexBasis: 0 }}
              >
                {usd(amount - toPool, 4)} to seller
              </motion.div>
            </div>
          </div>
        </Line>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[11.5px] text-muted sm:px-5">
        <span>
          {challenge?.live ? "Challenge read live from the endpoint just now." : "Showing the endpoint's published terms."} Payment replayed with lien #
          {lien?.id ?? 1}&apos;s {sweepPct}% sweep.
        </span>
        {latestSweep && (
          <a href={latestSweep.txUrl} target="_blank" className="inline-flex items-center gap-1 hover:text-cyan">
            latest real sweep {ago(latestSweep.at)} <IExternal size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function Line({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0.12, y: 4, filter: "blur(2px)" }}
      transition={{ duration: show ? 0.45 : 0.2, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <span className="text-muted">{k}</span>
      <span className="text-white/90">{v}</span>
    </div>
  );
}

/* ---------------- The loop, with a rail that fills as you read ---------------- */

function Loop({ data, lien }: { data: Overview | null; lien?: Lien }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const uw = data?.feed.filter((f) => f.decision?.agent === "underwriter") ?? [];
  const underwrite = uw.find((f) => f.decision!.action === "offer") ?? uw.find((f) => f.decision!.action === "reject") ?? uw[0];
  const tone = (a?: string) => (a === "reject" ? "text-danger" : a === "offer" || a === "fund" ? "text-success" : "text-info");
  const monitor = data?.feed.find((f) => f.decision?.agent === "monitor");
  const pct = lien ? Math.min(100, (lien.repaidUsdc / (lien.repayCapUsdc || 1)) * 100) : 0;

  const stages = [
    {
      t: "Underwrite",
      d: "An agent reads the seller's x402 receipts on Arc and Circle Gateway, checks who funded each payer, and decides whether the revenue is real. Wash trading and related-party payers get rejected.",
      art: underwrite?.decision && (
        <div>
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className={`font-semibold capitalize ${tone(underwrite.decision.action)}`}>{underwrite.decision.action.replaceAll("_", " ")}</span>
            <span className="text-muted">
              underwriter · <span className="mono">{short(underwrite.args.subject)}</span> · {ago(underwrite.at)}
            </span>
            {underwrite.decision.riskScore !== undefined && <span className="ml-auto text-amber">risk {underwrite.decision.riskScore}/100</span>}
          </div>
          <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-white/75">{underwrite.decision.rationale}</p>
          <a href={underwrite.txUrl} target="_blank" className="mt-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-cyan">
            anchored on Arc <IExternal size={12} />
          </a>
        </div>
      ),
    },
    {
      t: "Lien",
      d: "On acceptance the seller sets payTo to a splitter made for them, and the advance is written to a public registry. A second registered lender can't lend against the same revenue.",
      art: lien && (
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <Kv k={`Lien #${lien.id}`} v={lien.status} tone="text-cyan" />
          <Kv k="Principal" v={usd(lien.principalUsdc, 2)} />
          <Kv k="Repay cap" v={usd(lien.repayCapUsdc, 2)} />
          <Kv k="Splitter" v={short(lien.payTo)} mono />
        </div>
      ),
    },
    {
      t: "Sweep",
      d: "Every payment that reaches the splitter is divided on arrival: a share to the pool until the cap is repaid, the rest straight to the seller. Nobody has to remember to repay.",
      art: lien && (
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-white/80">Repaid so far</span>
            <span className="num text-[20px] font-semibold text-cyan">
              <Num value={lien.repaidUsdc} format={(n) => usd(n, 4)} />
            </span>
          </div>
          <div className="track mt-3 !h-2">
            <motion.div className="fill-cyan origin-left" initial={{ scaleX: 0 }} whileInView={{ scaleX: Math.max(pct, 1) / 100 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: EASE }} />
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {pct.toFixed(1)}% of {usd(lien.repayCapUsdc, 2)} · {(lien.sweepBps / 100).toFixed(0)}% of each payment
          </div>
        </div>
      ),
    },
    {
      t: "Watch",
      d: "A monitoring agent probes the seller's live endpoint. If payTo stops pointing at the splitter, it freezes the line and the splitter sweeps 100% until the seller restores it.",
      art: monitor?.decision && (
        <div className="text-[13px]">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold capitalize text-info">{monitor.decision.action}</span>
            <span className="text-muted">monitor · last check {ago(monitor.at)}</span>
          </div>
          <p className="mt-2 line-clamp-3 leading-relaxed text-white/75">{monitor.decision.rationale}</p>
        </div>
      ),
    },
    {
      t: "Park",
      d: "Cash the pool isn't lending goes to a treasury agent, which keeps enough liquid for the pipeline and parks the rest in USYC.",
      art: (
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-white/80">
            Parked by the treasury agent <span className="text-muted">(mock USYC teller on testnet)</span>
          </span>
          <span className="num text-[20px] font-semibold text-amber">
            <Num value={data?.pool.idleInUsycUsdc} format={(n) => usd(n, 2)} />
          </span>

        </div>
      ),
    },
  ];

  return (
    <section id="loop" className="mx-auto max-w-[1240px] scroll-mt-8 px-4 py-20 sm:px-6">
      <div className="max-w-[640px]">
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] sm:text-[38px]">Three agents, two contracts, one loop.</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/70">
          Each stage below shows what is happening on Arc right now, not a mockup. The right column is read live.
        </p>
      </div>

      <div ref={ref} className="relative mt-14">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-line" aria-hidden />
        <motion.div className="absolute left-[7px] top-2 w-px origin-top bg-gradient-to-b from-cyan via-cyan to-amber" style={{ scaleY: fill, bottom: 8 }} aria-hidden />
        <ol className="space-y-14">
          {stages.map((s) => (
            <motion.li
              key={s.t}
              initial={{ opacity: 0.25, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="relative grid gap-6 pl-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12"
            >
              <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-cyan bg-midnight shadow-[0_0_14px_rgba(54,217,232,0.6)]" />
              <div>
                <h3 className="text-[22px] font-semibold tracking-tight">{s.t}</h3>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-white/70">{s.d}</p>
              </div>
              <div className="panel p-5">{s.art ?? <div className="h-16 animate-pulse rounded-lg bg-glass/60" />}</div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Kv({ k, v, tone = "", mono }: { k: string; v: string; tone?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{k}</div>
      <div className={`num mt-0.5 text-[16px] font-semibold ${tone} ${mono ? "mono text-[14px] font-normal text-ice" : ""}`}>{v}</div>
    </div>
  );
}

/* ---------------- Limits ---------------- */

function Guardrails({ limits: L }: { limits?: Record<string, number> }) {
  const rows = [
    ["Largest single advance", usd(L?.maxAdvanceUsdc, 0)],
    ["A human must approve above", usd(L?.autoApproveLimitUsdc, 0)],
    ["Exposure to one seller", `≤ ${(L?.maxExposureBps ?? 0) / 100}% of the pool`],
    ["Sweep per payment", `${(L?.minSweepBps ?? 0) / 100}–${(L?.maxSweepBps ?? 0) / 100}%`],
    ["Marking a default", "humans only"],
  ];
  return (
    <section id="limits" className="mx-auto max-w-[1240px] scroll-mt-8 px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] sm:text-[38px]">The agent decides. The contract sets the limits.</h2>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-white/70">
            These limits live in the LenderPool contract on Arc, not in a prompt. However persuasive a seller&apos;s numbers, the agent can&apos;t
            sign past them.
          </p>
        </div>
        <dl className="panel divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-4">
              <dt className="text-[14px] text-white/75">{k}</dt>
              <dd className="num text-[18px] font-semibold tracking-tight">{L ? v : "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------- Close ---------------- */

function Close({ addresses }: { addresses?: Overview["addresses"] }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-16 pt-10 sm:px-6">
      <div className="panel edge relative overflow-hidden px-6 py-12 sm:px-12">
        <div className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 opacity-90 max-md:hidden">
          <PrismCube size={220} />
        </div>
        <h2 className="max-w-[20ch] text-[30px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">Read every decision yourself.</h2>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-white/70">
          The ledger shows each lien, sweep and agent decision as it happens, with a link to the transaction on Arc.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/ledger" className="btn btn-primary btn-lg">
            Open the live ledger <IArrow size={17} />
          </Link>
          <a href="https://github.com/sirbadenpowell/horos" target="_blank" className="btn btn-secondary btn-lg">
            Read the code
          </a>
        </div>
      </div>

      <footer className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted">
          <span>Arc testnet · chain 5042002</span>
          {addresses &&
            (
              [
                ["LienRegistry", addresses.registry],
                ["LenderPool", addresses.pool],
                ["USYC teller (mock)", addresses.teller],
              ] as const
            ).map(([k, a]) => (
              <a key={k} href={`${EXPLORER}/address/${a}`} target="_blank" className="hover:text-cyan">
                {k} <span className="mono">{short(a)}</span>
              </a>
            ))}
          <span className="ml-auto">The first lien is an operator-approved pilot over the agent&apos;s rejection. The ledger says so.</span>
      </footer>
    </section>
  );
}
