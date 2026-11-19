"use client";

import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, RefreshCw } from "lucide-react";
import { HoverCard } from "@/components/arc/hover-card/hover-card";

export type SourceState = "live" | "sample" | "loading" | "error" | "idle";
export type SourceRow = { label: string; value: ReactNode };

const STATE: Record<SourceState, { text: string; dot: string }> = {
  live: { text: "Live", dot: "bg-good" },
  sample: { text: "Sample data", dot: "bg-muted-foreground" },
  loading: { text: "Loading", dot: "bg-muted-foreground animate-pulse" },
  error: { text: "Not loading", dot: "bg-bad" },
  idle: { text: "No recent data", dot: "bg-warn" },
};

/** Spin at least this long, so a fast refresh still reads as one. */
const MIN_SPIN_MS = 650;
const EASE = [0.16, 1, 0.3, 1] as const;

/** Runs a refresh, tracking "busy" while it runs and "done" briefly after. */
function useRefresh(onRefresh?: () => unknown) {
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const running = useRef(false);
  const run = async () => {
    if (!onRefresh || running.current) return;
    running.current = true;
    setPhase("busy");
    await Promise.all([Promise.resolve(onRefresh()).catch(() => {}), new Promise((r) => setTimeout(r, MIN_SPIN_MS))]);
    setPhase("done");
    setTimeout(() => { setPhase("idle"); running.current = false; }, 1100);
  };
  return { phase, run };
}

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export function since(at: number, now: number) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** "in 4 min", "in 2 h", "in 3 d", or "due now" once the time has passed. */
export function until(at: number, now: number) {
  const s = (at - now) / 1000;
  if (s <= 60) return "due now";
  if (s < 3600) return `in ${Math.round(s / 60)} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} d`;
}

/**
 * A data source's mark in the header (Grok Bot, Gemini). Hover or focus opens an Arc hover card with
 * what the source does and when it last delivered, rows settling in one after another.
 */
export function SourceStatus({ name, logo, state, rows, onRefresh }: {
  name: string; logo: ReactNode; state: SourceState; rows: SourceRow[];
  /** Fetches the source again. Clicking the header button or the card's refresh button runs it. */
  onRefresh?: () => unknown;
}) {
  const s = STATE[state];
  const reduced = useReducedMotion();
  const { phase, run } = useRefresh(onRefresh);
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
        {onRefresh && (
          <button type="button" onClick={run} disabled={phase === "busy"} aria-label={`Refresh ${name}`} title={`Refresh ${name}`}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
            <AnimatePresence mode="wait" initial={false}>
              {phase === "done" ? (
                <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }} className="text-good">
                  <Check className="size-3.5" strokeWidth={2.75} aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span key="spin" initial={{ opacity: 0, scale: 0.6 }} exit={{ opacity: 0, scale: 0.6 }}
                  animate={phase === "busy" && !reduced ? { rotate: 360, opacity: 1, scale: 1 } : { rotate: 0, opacity: 1, scale: 1 }}
                  transition={phase === "busy" && !reduced ? { rotate: { repeat: Infinity, duration: 0.8, ease: "linear" }, opacity: { duration: 0.15 } } : { duration: 0.2, ease: EASE }}>
                  <RefreshCw className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
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
      {/* Same box as the theme toggle beside it (38px, 12px corners, card background, hairline border);
          the source's state is the dot in the corner. */}
      <button type="button" aria-label={`${name}: ${s.text}${onRefresh ? ". Click to refresh" : ""}`} onClick={run} aria-busy={phase === "busy"}
        className="relative grid size-[38px] place-items-center rounded-[12px] border border-border bg-card text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        {/* While refreshing, a short arc runs around the button's edge; it fades out when the data is back. */}
        <AnimatePresence>
          {phase === "busy" && (
            <motion.svg key="ring" className="pointer-events-none absolute -inset-px size-[38px] overflow-visible" viewBox="0 0 38 38" aria-hidden="true"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
              <motion.rect x="0.5" y="0.5" width="37" height="37" rx="11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                pathLength={100} strokeDasharray="22 78" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: reduced ? 0 : -100 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
            </motion.svg>
          )}
        </AnimatePresence>
        <motion.span className={state === "sample" || state === "loading" || state === "idle" ? "opacity-60" : undefined}
          animate={phase === "done" && !reduced ? { scale: [1, 0.82, 1.08, 1] } : { scale: 1 }} transition={{ duration: 0.45, ease: EASE }}>
          {logo}
        </motion.span>
        <span className="absolute -top-0.5 -right-0.5 flex size-2.5 rounded-full ring-2 ring-background" aria-hidden="true">
          {state === "live" && !reduced && <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" />}
          <span className={`relative size-2.5 rounded-full ${s.dot}`} />
        </span>
      </button>
    </HoverCard>
  );
}
