"use client";
import { useState } from "react";
import type { Hex } from "viem";
import { EXPLORER } from "@/lib/api";
import { explainError } from "@/lib/contracts";
import { useWallet, type Call } from "@/lib/wallet";
import { IExternal } from "./icons";

type State = { s: "idle" } | { s: "signing" } | { s: "confirmed"; tx: Hex } | { s: "error"; msg: string };

/** One button for every on-chain action: passkey prompt → user operation → confirmed, with readable errors. */
export function TxButton({
  label,
  build,
  onDone,
  disabled,
  variant = "btn-primary",
  className = "",
}: {
  label: string;
  build: () => Call[] | Promise<Call[]>;
  onDone?: (tx: Hex) => void | Promise<void>;
  disabled?: boolean;
  variant?: string;
  className?: string;
}) {
  const w = useWallet();
  const [st, setSt] = useState<State>({ s: "idle" });
  const run = async () => {
    setSt({ s: "signing" });
    try {
      const calls = await build();
      const { txHash } = await w.send(calls);
      setSt({ s: "confirmed", tx: txHash });
      await w.refresh();
      await onDone?.(txHash);
    } catch (e) {
      setSt({ s: "error", msg: explainError(e) });
    }
  };
  return (
    <div className={className}>
      <button className={`btn ${variant} w-full`} disabled={disabled || st.s === "signing" || w.status !== "ready"} onClick={run}>
        {st.s === "signing" ? "Confirm with your passkey…" : label}
      </button>
      <div aria-live="polite" className="mt-2 min-h-[18px] text-[12px]">
        {st.s === "confirmed" && (
          <a className="inline-flex items-center gap-1 text-success underline underline-offset-4" href={`${EXPLORER}/tx/${st.tx}`} target="_blank">
            Confirmed on Arc <IExternal size={12} />
          </a>
        )}
        {st.s === "error" && <span className="text-danger">{st.msg}</span>}
      </div>
    </div>
  );
}
