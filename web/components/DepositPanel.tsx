"use client";
import { useState } from "react";
import type { Address } from "viem";
import { usePoll, usd } from "@/lib/api";
import { calls } from "@/lib/contracts";
import type { Account, PoolInfo } from "@/lib/types";
import { FAUCET, useWallet } from "@/lib/wallet";
import { Connect } from "./Connect";
import { Tabs } from "./ui";
import { TxButton } from "./TxButton";

/** Deposit into / withdraw from one v2 pool. Withdrawals are capped at the pool's free cash. */
export function DepositPanel({ pool, onDone }: { pool: PoolInfo; onDone?: () => void }) {
  const w = useWallet();
  const { data: acct } = usePoll<Account>(w.address ? `/api/accounts/${w.address}` : null, 8000);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amt, setAmt] = useState("");
  const pos = acct?.positions.find((p) => p.pool.toLowerCase() === pool.address.toLowerCase());
  const n = Number(amt);
  const valid = Number.isFinite(n) && n > 0;

  if (!pool.openToDeposits)
    return <p className="text-[13px] leading-relaxed text-white/75">This is the operator&apos;s pilot pool from before the marketplace. It is closed to deposits; its history stays public.</p>;

  if (w.status !== "ready")
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-white/75">Sign in to deposit USDC into {pool.name}.</p>
        <Connect />
      </div>
    );

  const max = mode === "deposit" ? (w.usdc ?? 0) : (pos?.withdrawableUsdc ?? 0);
  const tooMuch = valid && n > max + 1e-9;

  return (
    <div className="space-y-3">
      <Tabs
        value={mode}
        onChange={(v) => {
          setMode(v);
          setAmt("");
        }}
        options={[
          { value: "deposit", label: "Deposit" },
          { value: "withdraw", label: "Withdraw" },
        ]}
      />
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-[12px] text-muted">Your position</dt>
          <dd className="num mt-0.5">{usd(pos?.valueUsdc ?? 0, 4)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">{mode === "deposit" ? "Your USDC on Arc" : "Withdrawable now"}</dt>
          <dd className="num mt-0.5">{usd(max, 4)}</dd>
        </div>
      </dl>

      {mode === "deposit" && (w.usdc ?? 0) === 0 ? (
        <p className="rounded-xl border border-line p-3 text-[13px] leading-relaxed text-white/80">
          You have $0 USDC on Arc.{" "}
          <a className="text-cyan underline underline-offset-4" href={FAUCET} target="_blank">
            Get testnet USDC from the Circle faucet
          </a>{" "}
          (Arc Testnet, paste your address), then come back.
        </p>
      ) : (
        <>
          <label className="block">
            <span className="text-[12px] text-muted">Amount (USDC)</span>
            <div className="mt-1 flex gap-2">
              <input className="input num flex-1" inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} />
              <button className="btn btn-ghost" onClick={() => setAmt(String(Math.floor(max * 1e6) / 1e6))}>
                Max
              </button>
            </div>
          </label>
          {tooMuch && (
            <p className="text-[12px] text-danger">
              {mode === "deposit" ? "That is more USDC than your account holds." : `You can withdraw up to ${usd(max, 4)} right now.`}
            </p>
          )}
          {mode === "withdraw" && pos && pos.valueUsdc > pos.withdrawableUsdc + 1e-6 && (
            <p className="text-[12px] leading-relaxed text-muted">
              {usd(pos.valueUsdc - pos.withdrawableUsdc, 4)} of your position is lent out or parked; it becomes withdrawable as sweeps repay advances.
            </p>
          )}
          <TxButton
            label={mode === "deposit" ? `Deposit${valid ? ` ${usd(n, 2)}` : ""}` : `Withdraw${valid ? ` ${usd(n, 2)}` : ""}`}
            disabled={!valid || tooMuch}
            build={() => (mode === "deposit" ? calls.deposit(pool.address as Address, n, w.address!) : calls.withdraw(pool.address as Address, n, w.address!))}
            onDone={() => {
              setAmt("");
              onDone?.();
            }}
          />
        </>
      )}
    </div>
  );
}
