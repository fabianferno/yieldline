"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FAUCET, useWallet } from "@/lib/wallet";
import { EXPLORER, short } from "@/lib/api";
import { IExternal } from "./icons";

/** Passkey sign-in. One account works as seller, lender and curator. */
export function Connect({ compact = false }: { compact?: boolean }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (w.status === "unconfigured")
    return <div className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted">Wallet sign-in is not configured on this deployment.</div>;

  if (w.status !== "ready")
    return (
      <div className="space-y-2">
        <div className={`flex gap-2 ${compact ? "" : "flex-col"}`}>
          <button className="btn btn-primary flex-1" disabled={w.status === "connecting"} onClick={() => w.connect("register")}>
            {w.status === "connecting" ? "Waiting for passkey…" : "Create account"}
          </button>
          <button className="btn btn-ghost flex-1" disabled={w.status === "connecting"} onClick={() => w.connect("login")}>
            Sign in with passkey
          </button>
        </div>
        {w.error && <p className="text-[12px] text-danger">{w.error}</p>}
        {!compact && <p className="text-[11px] leading-relaxed text-muted">A passkey on this device controls a Circle smart account on Arc. No extension, no seed phrase.</p>}
      </div>
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="relative">
      <button className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-left hover:border-cyan/40" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
        <span className="min-w-0 flex-1">
          <span className="mono block truncate text-[13px] text-white">{short(w.address)}</span>
          <span className="num block text-[12px] text-muted">{w.usdc === undefined ? "…" : `$${w.usdc.toFixed(2)} USDC`}</span>
        </span>
        <span className="text-[11px] text-muted">{open ? "Close" : "Account"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="panel absolute inset-x-0 top-full z-30 mt-2 space-y-3 p-3 text-[12px]"
          >
            <div>
              <div className="text-muted">Your Arc address</div>
              <div className="mono mt-1 break-all text-[12px] text-ice">{w.address}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost !h-8 !px-3 text-[12px]" onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </button>
              <a className="btn btn-ghost !h-8 !px-3 text-[12px]" href={`${EXPLORER}/address/${w.address}`} target="_blank">
                Explorer <IExternal size={12} />
              </a>
            </div>
            {(w.usdc ?? 0) < 1 && (
              <p className="leading-relaxed text-white/80">
                You need testnet USDC on Arc to lend or pay gas.{" "}
                <a className="text-cyan underline underline-offset-4" href={FAUCET} target="_blank">
                  Get some from the Circle faucet
                </a>{" "}
                (choose Arc Testnet, paste your address).
              </p>
            )}
            <button className="text-muted underline underline-offset-4 hover:text-white" onClick={w.disconnect}>
              Sign out on this device
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Inline gate for pages that need an account. */
export function NeedsAccount({ what }: { what: string }) {
  return (
    <section className="panel mx-auto max-w-[520px] p-6 text-center">
      <h2 className="text-[20px] font-semibold tracking-tight">Sign in to {what}</h2>
      <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-white/75">
        Yieldline uses a passkey on this device. It creates a Circle smart account on Arc for you in one step.
      </p>
      <div className="mx-auto mt-5 max-w-[360px]">
        <Connect />
      </div>
    </section>
  );
}
