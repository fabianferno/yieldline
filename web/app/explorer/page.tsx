"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Explorer() {
  const [a, setA] = useState("");
  const router = useRouter();
  const ok = /^0x[0-9a-fA-F]{40}$/.test(a.trim());
  return (
    <div className="max-w-2xl">
      <div className="engraved text-[11px] text-terra">Public lien explorer</div>
      <h1 className="mt-2 font-serif text-4xl font-semibold">Look up a business before you lend to it.</h1>
      <p className="mt-3 text-ink-2">
        Any lender can read a seller&apos;s encumbrances, repayment record, and x402 revenue profile straight from Arc. The same
        lookup is sold per call over x402 by the Horos Lien Oracle.
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) router.push(`/lien/${a.trim()}`);
        }}
      >
        <input
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="0x… seller wallet"
          className="num w-full rounded-sm border border-rule bg-card px-3 py-2 text-sm outline-none focus:border-terra"
        />
        <button disabled={!ok} className="rounded-sm bg-ink px-4 py-2 text-sm text-card disabled:opacity-40">
          Look up
        </button>
      </form>
    </div>
  );
}
