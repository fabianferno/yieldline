"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** A number that travels to its new value instead of jumping, so a live update reads as movement. */
export function Num({ value, format }: { value: number | null | undefined; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value ?? 0);
  const from = useRef(value ?? 0);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value === null || value === undefined) return;
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    if (value > start) setFlash((n) => n + 1);
    const c = animate(start, value, { duration: 0.9, ease: EASE, onUpdate: setShown });
    return () => c.stop();
  }, [value, reduce]);
  if (value === null || value === undefined) return <>—</>;
  return (
    <span key={flash} className={flash ? "num-flash" : undefined}>
      {format(shown)}
    </span>
  );
}

/** Fires once each time `value` grows: used to replay the sweep pulse when a repayment lands. */
export function useGrowth(value: number | undefined) {
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value !== undefined && prev.current !== undefined && value > prev.current) setN((x) => x + 1);
    prev.current = value;
  }, [value]);
  return n;
}
