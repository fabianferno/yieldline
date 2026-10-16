"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IArrow, ISearch, PrismCube } from "@/components/icons";

const EXAMPLES = [
  { a: "0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f", label: "Horos Lien Oracle · financed (lien #1)" },
  { a: "0xa8904aaa5ef379ccad3edad0c8545fb0951d6466", label: "Arc seller · 55 days, 14 payers · offer outstanding" },
  { a: "0x43f10820df70545f0b308ed014e5b5e5b7f28f28", label: "Wash seller · self-funded payers · rejected" },
];

export default function Explorer() {
  const [a, setA] = useState("");
  const router = useRouter();
  const ok = /^0x[0-9a-fA-F]{40}$/.test(a.trim());
  return (
    <div className="space-y-4">
      <section className="panel edge relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 opacity-90 max-lg:hidden">
          <PrismCube size={200} />
        </div>
        <div className="relative max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-cyan">Public lien explorer</div>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight">Look up a business before you lend to it.</h1>
          <p className="mt-3 text-[15px] text-muted">
            Encumbrances, repayment record and x402 revenue forensics, read straight from Arc and Circle Gateway. The same lookup is sold per
            call over x402 by the Horos Lien Oracle.
          </p>
          <form
            className="mt-6 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (ok) router.push(`/lien/${a.trim()}`);
            }}
          >
            <div className="edge relative flex-1 rounded-[10px]">
              <ISearch size={18} className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-white/80" />
              <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Search a seller wallet 0x…" className="input mono" />
            </div>
            <button disabled={!ok} className="btn btn-primary edge glow-cyan h-11">
              Look up <IArrow size={16} />
            </button>
          </form>
        </div>
      </section>
      <section className="panel p-5">
        <h2 className="panel-title mb-3">Try these</h2>
        <div className="space-y-2">
          {EXAMPLES.map((e) => (
            <button key={e.a} onClick={() => router.push(`/lien/${e.a}`)} className="nav-item w-full justify-between border border-line">
              <span className="text-[13px]">{e.label}</span>
              <span className="mono text-[12px] text-muted">{e.a.slice(0, 10)}…</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
