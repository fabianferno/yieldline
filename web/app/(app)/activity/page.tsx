"use client";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { usePoll } from "@/lib/api";
import { ActivityList, DecisionEntry, Panel, Skeleton, Tabs, type FeedItem } from "@/components/ui";

type Filter = "all" | "underwriter" | "monitor" | "human";

export default function Activity() {
  const { data, error } = usePoll<{ feed: FeedItem[] }>("/api/activity", 10000);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(12);
  const decisions = data?.feed.filter((f) => f.event === "Decision" && f.decision) ?? [];
  const by = (a: Filter) => decisions.filter((d) => a === "all" || d.decision!.agent === a || (a === "monitor" && d.decision!.agent === "treasury"));
  const shown = by(filter);
  const events = data?.feed.filter((f) => f.event !== "Decision") ?? [];

  return (
    <div className="space-y-5">
      <section className="panel edge p-5 sm:p-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Activity</h1>
        <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-white/75">
          Every agent and curator decision across all pools, with its reasoning, and every on-chain event behind it. Each decision is
          hash-anchored on Arc, so the text you read here is the text that was committed.
        </p>
      </section>
      {error && !data && <div className="alert alert-error text-[13px]">Can&apos;t reach the Yieldline API: {error}</div>}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Decisions">
          <div className="overflow-x-auto">
            <Tabs<Filter>
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setLimit(12);
              }}
              options={[
                { value: "all", label: "All", count: decisions.length },
                { value: "underwriter", label: "Underwriter", count: by("underwriter").length },
                { value: "monitor", label: "Monitor & treasury", count: by("monitor").length },
                { value: "human", label: "Curators", count: by("human").length },
              ]}
            />
          </div>
          <div className="divide-y divide-line">
            {!data ? (
              <Skeleton rows={4} />
            ) : shown.length ? (
              <AnimatePresence initial={false} mode="popLayout">
                {shown.slice(0, limit).map((f) => (
                  <DecisionEntry key={f.tx + f.at} f={f} />
                ))}
              </AnimatePresence>
            ) : (
              <p className="py-6 text-[13px] text-muted">Nothing here yet.</p>
            )}
          </div>
          {shown.length > limit && (
            <button onClick={() => setLimit(limit + 12)} className="btn btn-ghost mt-2 w-full">
              Show more
            </button>
          )}
        </Panel>
        <Panel title="On-chain events" right="newest first">
          {!data ? <Skeleton rows={5} /> : <ActivityList items={events} max={30} />}
        </Panel>
      </div>
    </div>
  );
}
