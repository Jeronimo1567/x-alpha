"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HoverCard } from "@/components/arc/hover-card/hover-card";

export type SourceState = "live" | "sample" | "loading" | "error";
export type SourceRow = { label: string; value: ReactNode };

const STATE: Record<SourceState, { text: string; dot: string; ring: string }> = {
  live: { text: "Live", dot: "bg-good", ring: "outline-good outline-solid" },
  sample: { text: "Sample data", dot: "bg-muted-foreground", ring: "outline-muted-foreground/60 outline-dashed opacity-60" },
  loading: { text: "Loading", dot: "bg-muted-foreground animate-pulse", ring: "outline-muted-foreground/60 outline-dashed opacity-60" },
  error: { text: "Not loading", dot: "bg-bad", ring: "outline-bad/70 outline-dashed" },
};

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export function since(at: number, now: number) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/**
 * A data source's mark in the header (Grok Bot, Gemini). Hover or focus opens an Arc hover card with
 * what the source does and when it last delivered, rows settling in one after another.
 */
export function SourceStatus({ name, logo, state, rows }: { name: string; logo: ReactNode; state: SourceState; rows: SourceRow[] }) {
  const s = STATE[state];
  const reduced = useReducedMotion();
  const card = (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-950 text-white">{logo}</span>
        <div className="min-w-0 flex-1 text-sm font-semibold">{name}</div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium">
          <span className="relative flex size-1.5">
            {state === "live" && !reduced && <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" />}
            <span className={`relative size-1.5 rounded-full ${s.dot}`} />
          </span>
          {s.text}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-foreground/[0.07] pt-3 text-xs">
        {rows.flatMap((r, i) => {
          const settle = {
            initial: reduced ? false : { opacity: 0, y: 3 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const, delay: 0.06 + i * 0.04 },
          };
          return [
            <motion.dt key={`${r.label}-l`} className="text-muted-foreground" {...settle}>{r.label}</motion.dt>,
            <motion.dd key={`${r.label}-v`} className="truncate text-right font-medium whitespace-nowrap tabular-nums" {...settle}>{r.value}</motion.dd>,
          ];
        })}
      </dl>
    </div>
  );
  return (
    <HoverCard content={card} side="bottom" align="end" openDelay={180} className="w-[20rem]! max-w-[calc(100vw-24px)]!">
      <button type="button" aria-label={`${name}: ${s.text}`}
        className={`grid size-9 place-items-center rounded-full bg-neutral-950 text-white outline-2 outline-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring ${s.ring}`}>
        {logo}
      </button>
    </HoverCard>
  );
}
