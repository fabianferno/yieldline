"use client";
import { useEffect, useState } from "react";

export const API = process.env.NEXT_PUBLIC_HOROS_API ?? "http://localhost:4021";
export const EXPLORER = "https://explorer.testnet.arc.io";

export function usePoll<T>(path: string | null, ms = 6000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API}${path}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.error) setError(j.error);
        else {
          setData(j);
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? "fetch failed");
      }
    };
    load();
    const t = setInterval(load, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path, ms]);
  return { data, error };
}

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const usd = (n?: number | null, d = 2) =>
  n === undefined || n === null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) })}`;
export const ago = (iso?: string) => {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
