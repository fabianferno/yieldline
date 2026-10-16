"use client";
import { useEffect } from "react";

/**
 * Specular edge light for every `.btn`: the lit arc sits on the part of the edge nearest the cursor
 * and brightens as the cursor approaches. One window listener, one rAF per frame, CSS does the rest.
 */
const PROXIMITY = 220;
const IDLE = 0.3;

export function SpecularField() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let x = -1e4,
      y = -1e4,
      raf = 0;
    const paint = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(".btn").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -PROXIMITY || r.top > innerHeight + PROXIMITY) return;
        const cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        const dx = Math.max(r.left - x, 0, x - r.right),
          dy = Math.max(r.top - y, 0, y - r.bottom);
        const dist = Math.hypot(dx, dy);
        const near = Math.max(0, 1 - dist / PROXIMITY);
        // conic-gradient 0deg points up and runs clockwise; atan2 0 points right.
        const a = (Math.atan2(y - cy, (x - cx) * (r.height / r.width)) * 180) / Math.PI + 90;
        el.style.setProperty("--spec-a", `${a.toFixed(1)}deg`);
        el.style.setProperty("--spec-i", (IDLE + (1 - IDLE) * near * near).toFixed(3));
        el.style.setProperty("--spec-x", `${x - r.left}px`);
        el.style.setProperty("--spec-y", `${y - r.top}px`);
      });
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => {
      x = y = -1e4;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", move, { passive: true });
    const scroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("scroll", scroll);
      document.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
