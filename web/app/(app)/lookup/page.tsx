"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { IArrow, ISearch, PrismCube } from "@/components/icons";

const EXAMPLES = [
  { a: "0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f", name: "Yieldline Lien Oracle", note: "Financed under an operator pilot · advance #1 active", tone: "bg-cyan" },
  { a: "0xa8904aaa5ef379ccad3edad0c8545fb0951d6466", name: "Arc seller 0xa890", note: "55 days of history, 14 payers · offer outstanding", tone: "bg-success" },
  { a: "0x43f10820df70545f0b308ed014e5b5e5b7f28f28", name: "Wash seller", note: "Payers funded by the seller · rejected at risk 95", tone: "bg-danger" },
];

export default function Explorer() {
  const [a, setA] = useState("");
  const router = useRouter();
  const ok = /^0x[0-9a-fA-F]{40}$/.test(a.trim());
  return (
    <div className="space-y-4">
      <section className="panel edge relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 opacity-90 max-lg:hidden">
          <PrismCube size={150} />
        </div>
        <div className="relative max-w-2xl">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">Look up a business before you lend to it.</h1>
          <p className="mt-3 text-[15px] text-muted">
            Whether its revenue is already pledged, its repayment record and where its x402 revenue really comes from, read straight from Arc and Circle Gateway. The same lookup is sold per
            call over x402 by the Yieldline Lien Oracle.
          </p>
          <form
            id="tour-lookup"
            className="mt-6 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (ok) router.push(`/seller/${a.trim()}`);
            }}
          >
            <div className="edge relative flex-1 rounded-[10px]">
              <ISearch size={18} className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-white/80" />
              <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Seller wallet address, 0x…" aria-label="Seller wallet address" className="input mono" />
            </div>
            <button disabled={!ok} className="btn btn-primary h-11">
              Look up <IArrow size={16} />
            </button>
          </form>
        </div>
      </section>
      <section className="panel p-4 sm:p-5">
        <h2 className="panel-title mb-2">Sellers on file</h2>
        <div className="divide-y divide-line">
          {EXAMPLES.map((e) => (
            <Link key={e.a} href={`/seller/${e.a}`} className="group flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-glass/40">
              <span className={`h-2 w-2 shrink-0 rounded-full ${e.tone}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-white">{e.name}</span>
                <span className="block text-[12px] text-muted">{e.note}</span>
              </span>
              <span className="mono text-[12px] text-muted max-sm:hidden">{e.a.slice(0, 6)}…{e.a.slice(-4)}</span>
              <IArrow size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-cyan" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
