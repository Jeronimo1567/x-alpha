"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Avatar } from "@/components/account-avatar";
import { LineChart, type LineChartDatum } from "@/components/arc/line-chart/line-chart";
import type { Account } from "@/lib/sample";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { neutralAccent } from "@/components/shared";
import type { TokenSymbol } from "@/lib/stance";
import type { Call, PriceSeries } from "@/lib/track";

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Each range samples the hourly history so the chart keeps 40 to 60 points. */
const RANGES = { "7D": { days: 7, every: 4 }, "30D": { days: 30, every: 12 } } as const;
type Range = keyof typeof RANGES;
const HEIGHT = 200;
/** Must match the LineChart: room above the top gridline, and the value column on the right. */
const TOP = 12, GUTTER = 48;

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 3 : 0 });
const signed = (n: number, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%";
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const stamp = (t: number) => new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric" });
const posted = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The LineChart's value scale (gridlines from zero unless the data dips below it), so markers sit exactly on the line. */
function niceScale(low: number, high: number) {
  const lo = Math.min(0, low), hi = Math.max(high, lo + 1);
  const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / 4));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = factor * magnitude, bottom = Math.floor(lo / step) * step, top = Math.ceil(hi / step) * step;
    if ((top - bottom) / step <= 4 + 1e-9) return { min: bottom, max: top };
  }
  return { min: lo, max: hi };
}

type Marker = { key: string; call: Call; account: Account; x: number; y: number };
/** One account's calls on the chart. Pass two to compare accounts on the same price line. */
export type CallSource = { account: Account; calls: Call[] };

/**
 * Token price over the chosen range, as change from the start of the range so the move fills the plot.
 * Every bullish or bearish call sits on the line where it was posted; hover one to preview the post, click to open it on X.
 */
export function PriceCallsChart({ symbol, series, sources, toolbar }: { symbol: TokenSymbol; series: PriceSeries | undefined; sources: CallSource[]; toolbar?: React.ReactNode }) {
  // With two accounts, each marker is that account's avatar, so you can tell whose call it was.
  const compare = sources.length > 1;
  const [range, setRange] = useState<Range>("7D");
  const [previewId, setPreviewId] = useState<string | null>(null);
  // The preview belongs to the arrow: it opens on hover or focus and closes when the pointer leaves.
  // A short grace lets the pointer cross onto the card so it can still be clicked.
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = () => { if (closing.current) { clearTimeout(closing.current); closing.current = null; } };
  const open = (id: string) => { keep(); setPreviewId(id); };
  const close = () => { keep(); closing.current = setTimeout(() => setPreviewId(null), 100); };
  useEffect(() => keep, []);

  const view = useMemo(() => {
    if (!series?.length) return null;
    const { days, every } = RANGES[range];
    const end = series[series.length - 1][0];
    const inRange = series.filter(([t]) => t >= end - days * DAY);
    // Sample from the newest point back, so the latest price is always shown.
    const points = inRange.filter((_, i) => (inRange.length - 1 - i) % every === 0);
    const base = points[0][1];
    const change = (close: number) => (close / base - 1) * 100;
    // Label each new day where it starts; the range rarely starts at midnight, so its first partial day stays unlabelled.
    let lastDay = day(points[0][0]);
    const data: LineChartDatum[] = points.map(([t, close]) => {
      const d = day(t);
      const axisLabel = d !== lastDay ? d : undefined;
      lastDay = d;
      return { key: String(t), label: stamp(t), axisLabel, values: { change: change(close) } };
    });
    const values = data.map((d) => d.values.change!);
    const scale = niceScale(Math.min(...values), Math.max(...values));
    const first = points[0][0], last = points[points.length - 1][0];
    const markers: Marker[] = sources.flatMap(({ account, calls }) => calls
      .filter((c) => c.postedAt >= first && c.postedAt <= last + HOUR)
      .map((call) => {
        const t = Math.min(call.postedAt, last);
        const i = Math.max(0, points.findIndex(([pt], n) => pt <= t && (points[n + 1]?.[0] ?? Infinity) > t));
        const [t0, c0] = points[i], [t1, c1] = points[i + 1] ?? points[i];
        const close = t1 === t0 ? c0 : c0 + ((c1 - c0) * (t - t0)) / (t1 - t0);
        const x = last === first ? 0.5 : (t - first) / (last - first);
        const y = (TOP + (1 - (change(close) - scale.min) / (scale.max - scale.min || 1)) * (HEIGHT - TOP)) / HEIGHT;
        return { key: `${account.handle}:${call.id}`, call, account, x, y };
      }))
      .sort((a, b) => a.x - b.x);
    return { data, points, base, markers };
  }, [series, range, sources]);

  if (!view) return (
    <div className="grid gap-1.5">
      {toolbar && <div className="min-w-0">{toolbar}</div>}
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: HEIGHT + 60 }}>Loading {symbol} prices from Gemini…</div>
    </div>
  );

  const preview = view.markers.find((m) => m.key === previewId) ?? null;
  const empty = view.markers.length ? null : emptyHint(symbol, range, sources, view.points[view.points.length - 1][0]);

  return (
    <div className="grid gap-1.5">
      {/* Range uses the same chips as the coin picker, on the same row as anything passed in (Compare's coins). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{toolbar}</div>
        <div style={neutralAccent}>
          <ChipGroup label="Range" multiple={false} value={[range]}
            onValueChange={(v) => { if (v[0]) { setRange(v[0] as Range); setPreviewId(null); } }}
            options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: r }))} />
        </div>
      </div>

      <div className="relative">
        {/* Nothing to mark: the chart blurs behind a note that says why and how to see their calls. */}
        <div className={empty ? "pointer-events-none opacity-50 blur-[3px] transition-[filter,opacity] select-none" : "transition-[filter,opacity]"} aria-hidden={empty ? true : undefined}>
        <LineChart
          label={`${symbol} price change`}
          categoryLabel="Time"
          data={view.data}
          series={[{ key: "change", label: symbol, color: "var(--foreground)" }]}
          height={HEIGHT}
          legend={false}
          formatValue={(v) => `${usd(view.base * (1 + v / 100))} (${signed(v)})`}
          formatTick={(v) => signed(v, Number.isInteger(v) ? 0 : 1)}
        />
        </div>
        {empty && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="grid max-w-sm justify-items-center gap-2 rounded-xl bg-card/85 px-5 py-4 text-center shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm">
              <span className="text-sm font-semibold">{empty.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground text-pretty">{empty.body}</span>
              {empty.action && (
                <button type="button" onClick={() => { setRange(empty.action!.range); setPreviewId(null); }}
                  className="mt-1 h-8 rounded-[10px] bg-foreground px-3.5 text-xs font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
                  {empty.action.label}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Calls drawn over the plot area only, so they line up with the line. */}
        <div className="pointer-events-none absolute top-0 left-0" style={{ right: GUTTER, height: HEIGHT }}>
          {view.markers.map(({ key, call, account, x, y }) => {
            const on = key === previewId;
            const bull = call.stance === "bullish";
            return (
              <div key={key}>
                <span aria-hidden="true" className={`absolute w-px -translate-x-1/2 border-l border-dashed ${bull ? "border-good" : "border-bad"} ${on ? "opacity-70" : "opacity-25"}`}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%`, bottom: 0 }} />
                <a href={call.url} target="_blank" rel="noreferrer"
                  aria-label={`${compare ? account.handle + ", " : ""}${call.stance} call, ${posted(call.postedAt)}: ${call.text}. ${call.settled ? (call.right ? "Right" : "Wrong") : "Still open"}, ${signed(call.gain * 100)}.${call.url ? " Opens on X." : ""}`}
                  onPointerEnter={() => open(key)} onPointerLeave={close} onFocus={() => open(key)} onBlur={close}
                  onClick={(e) => { if (!call.url) e.preventDefault(); }}
                  className={`pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card shadow-sm transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring ${compare ? "size-6 ring-2" : "size-[22px] ring-1"} ${bull ? `text-good ${compare ? "ring-good" : "ring-good/40"}` : `text-bad ${compare ? "ring-bad" : "ring-bad/40"}`} ${call.settled ? "" : "opacity-60"} ${on ? "z-10 scale-[1.3]" : "hover:scale-115"}`}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
                  {compare ? (
                    <>
                      <Avatar account={account} className="size-6 text-[8px]" />
                      {/* The lean, as a small badge on the avatar. */}
                      <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-card ring-1 ring-current">
                        {bull ? <ArrowUpRight className="size-2.5" strokeWidth={3} aria-hidden="true" /> : <ArrowDownRight className="size-2.5" strokeWidth={3} aria-hidden="true" />}
                      </span>
                    </>
                  ) : bull ? <ArrowUpRight className="size-3.5" strokeWidth={2.75} aria-hidden="true" /> : <ArrowDownRight className="size-3.5" strokeWidth={2.75} aria-hidden="true" />}
                </a>
              </div>
            );
          })}
        </div>

        <AnimatePresence>{preview && <PostPreview key={preview.key} marker={preview} onEnter={keep} onLeave={close} />}</AnimatePresence>
      </div>

      <p className="text-xs text-muted-foreground">
        {view.markers.length > 0 && <><ArrowUpRight className="inline size-3.5 text-good" strokeWidth={2.75} aria-hidden="true" /> bullish · <ArrowDownRight className="inline size-3.5 text-bad" strokeWidth={2.75} aria-hidden="true" /> bearish</>}
      </p>
    </div>
  );
}

/**
 * Nothing to mark: say why, and how to see their calls. Calls older than this range → offer the longer range;
 * older than every range → when the latest one was; none at all → that their posts never picked a direction.
 */
function emptyHint(symbol: TokenSymbol, range: Range, sources: CallSource[], end: number): { title: string; body: string; action?: { label: string; range: Range } } {
  const calls = sources.flatMap((s) => s.calls);
  const one = sources.length === 1 ? sources[0].account.handle : null;
  if (!calls.length) {
    return {
      title: `No ${symbol} calls yet`,
      body: `${one ? `${one}'s` : "Their"} posts about ${symbol} never picked a direction, so there's nothing to mark. Pick a coin with a lean to see their calls here.`,
    };
  }
  const longest = (Object.keys(RANGES) as Range[]).at(-1)!;
  const hidden = calls.filter((c) => c.postedAt >= end - RANGES[longest].days * DAY).length;
  if (range !== longest && hidden) {
    return {
      title: `${hidden} ${symbol} call${hidden === 1 ? "" : "s"} hidden`,
      body: `None in the last ${RANGES[range].days} days. Switch to ${RANGES[longest].days} days to see ${hidden === 1 ? "it" : "them"} on the chart.`,
      action: { label: `Show ${RANGES[longest].days} days`, range: longest },
    };
  }
  const latest = Math.max(...calls.map((c) => c.postedAt));
  return { title: `No ${symbol} calls in this range`, body: `The latest was ${day(latest)}, before this chart starts.` };
}

/** The post behind a call, styled like a small X card, floating above (or below) its marker. Clicking opens it on X. */
function PostPreview({ marker: { call, account, x, y }, onEnter, onLeave }: { marker: Marker; onEnter: () => void; onLeave: () => void }) {
  const above = y > 0.45;
  const style: CSSProperties = {
    // Keep the 300px card inside the plot: anchor to the marker, clamped at both edges.
    left: `clamp(0px, calc(${x * 100}% - 150px), calc(100% - ${GUTTER}px - 300px))`,
    ...(above ? { bottom: `calc(${(1 - y) * HEIGHT}px + 14px + 26px)` } : { top: `calc(${y * HEIGHT}px + 14px)` }),
  };
  const result = call.settled ? (call.right ? "Right" : "Wrong") : "Open";
  const tone = !call.settled ? "text-muted-foreground" : call.right ? "text-good" : "text-bad";
  const Tag = call.url ? motion.a : motion.div;
  // Comes to be out of its marker: grows from the side the marker is on, rises toward its spot and sharpens.
  // Reduced motion keeps only the fade.
  const reduced = useReducedMotion();
  const toward = above ? 10 : -10;
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: toward, filter: "blur(4px)" };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" };
  return (
    <Tag {...(call.url ? { href: call.url, target: "_blank", rel: "noreferrer" } : {})}
      className="absolute z-20 grid w-[300px] max-w-full gap-2 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
      style={{ ...style, transformOrigin: above ? "50% 100%" : "50% 0%" }}
      onPointerEnter={onEnter} onPointerLeave={onLeave}
      initial={hidden}
      animate={{ ...shown, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
      exit={{ ...hidden, scale: reduced ? undefined : 0.97, y: reduced ? undefined : toward / 2, transition: { duration: 0.14, ease: [0.7, 0, 0.84, 0] } }}>
      <div className="flex items-center gap-2">
        <Avatar account={account} className="size-8 text-[11px]" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{account.name}</div>
          <div className="truncate text-xs text-muted-foreground">{account.handle} · {posted(call.postedAt)}</div>
        </div>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>
      <p className="line-clamp-4 text-sm leading-snug">{call.text}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-foreground/10 pt-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${call.stance === "bullish" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{call.stance}</span>
        <span className={`font-mono font-medium ${tone}`}>{result} {signed(call.gain * 100)}</span>
        <span className="font-mono text-muted-foreground">{usd(call.entry)} → {usd(call.exit)}</span>
        <span className="ml-auto text-muted-foreground">{call.url ? "Open on X ↗" : "Sample post"}</span>
      </div>
    </Tag>
  );
}
