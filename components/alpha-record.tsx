"use client";
// Calls graded against the market (lib/track): the beat-the-market badge, one cell per horizon with alpha hit rate
// and mean alpha, and the follow curve with a raw / alpha toggle. Used by the account view, Compare and the dashboard.

import { useMemo, useState, type CSSProperties } from "react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { card, date, label, neutralAccent, signed } from "@/components/shared";
import type { TokenSymbol } from "@/lib/stance";
import { followCurve, HORIZONS, marketVerdict, MIN_SETTLED, type Call, type CurveMode, type HorizonKey, type MarketVerdict, type Scorecard, type TrackRecord } from "@/lib/track";

const horizonLabel = (h: HorizonKey) => HORIZONS.find((x) => x.key === h)!.label;
const tone = (n: number | null | undefined) => (n == null ? "" : n > 0 ? "text-good" : n < 0 ? "text-bad" : "");
const pct0 = (n: number) => `${Math.round(n * 100)}%`;
/** Alpha is often a fraction of a percent, so it gets two decimals where a price move gets one. */
const signed2 = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n * 100).toFixed(2) + "%";

/** What the market means for a token's calls, in a few words. */
export const benchmarkName = (token: TokenSymbol | null) => (token === "BTC" ? "an equal-weight crypto basket" : token ? "BTC" : "BTC (the basket for BTC calls)");

const VERDICT: Record<MarketVerdict["kind"], { text: string; cls: string; detail: string }> = {
  beats: { text: "Beats the market", cls: "bg-good-soft text-good", detail: "Their calls earned more than just riding the market the same way, by clearly more than noise." },
  rides: { text: "Rides the market", cls: "bg-foreground/[0.06] text-foreground", detail: "Mostly right on price, but no better than the market's own move: the call was right because everything moved." },
  trails: { text: "Trails the market", cls: "bg-bad-soft text-bad", detail: "Following them did worse than riding the market the same way." },
  unclear: { text: "Edge unclear", cls: "bg-foreground/[0.06] text-muted-foreground", detail: "Some calls beat the market, but not by more than noise yet." },
  few: { text: "Too early to tell", cls: "bg-foreground/[0.04] text-muted-foreground", detail: `Fewer than ${MIN_SETTLED} settled calls at every horizon.` },
};

/** The "beat the market" badge: one verdict over every horizon, details on hover. */
export function BeatMarketBadge({ record, className = "" }: { record: Scorecard | null; className?: string }) {
  if (!record) return null;
  const v = marketVerdict(record);
  const d = VERDICT[v.kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${d.cls} ${className}`}
      title={`${d.detail}${v.kind === "beats" && v.horizon ? ` Strongest over ${horizonLabel(v.horizon)}.` : ""}`}>
      {d.text}{v.kind === "beats" && v.horizon && <span className="opacity-70">· {v.horizon}</span>}
    </span>
  );
}

/**
 * One cell per horizon: share of calls that beat the market (big), mean alpha, and the plain hit rate beside it.
 * The horizon where mean alpha peaks gets a ring: that is how long their edge takes to show.
 */
export function HorizonRow({ record, token }: { record: Scorecard | null; token: TokenSymbol | null }) {
  if (!record) return <div className="text-xs text-muted-foreground">Loading prices…</div>;
  const peak = record.decay.peak;
  return (
    // Four across when there is room, two by two in a half-width panel (Compare).
    <div className="@container grid gap-1.5">
      <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {HORIZONS.map((h) => {
          const t = record.horizons[h.key];
          const few = t.signal === "too few";
          return (
            <div key={h.key} className={`grid gap-0.5 rounded-lg px-3 py-2 ${peak === h.key ? "bg-foreground/[0.06] ring-1 ring-foreground/20" : "bg-foreground/[0.03]"}`}
              title={t.settled ? `${t.beat} of ${t.benchmarked} beat the market over ${h.label}; ${t.right} of ${t.settled} made money.${t.tStat !== null ? ` t = ${t.tStat.toFixed(1)}.` : ""}` : `No call has had ${h.label} to play out yet.`}>
              <dt className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{h.key}</span>
                <span>{t.settled ? (few ? `n=${t.settled} · few` : `n=${t.settled}`) : "–"}</span>
              </dt>
              <dd className="grid gap-0.5">
                <span className={`text-base font-semibold tabular-nums ${few ? "text-muted-foreground" : ""}`}>
                  {t.alphaHitRate !== null ? pct0(t.alphaHitRate) : "–"}<span className="ml-1 text-[11px] font-normal text-muted-foreground">beat mkt</span>
                </span>
                <span className="flex items-baseline justify-between gap-1 text-[11px] tabular-nums">
                  <span className={tone(t.meanAlpha)} title="Mean alpha per call">{t.meanAlpha !== null ? `α ${signed2(t.meanAlpha)}` : "α –"}</span>
                  <span className="text-muted-foreground" title="Plain hit rate: calls that made money">{t.hitRate !== null ? `${pct0(t.hitRate)} right` : ""}</span>
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        Each call minus what {benchmarkName(token)} did over the same window.
        {peak ? <> Edge peaks at <b className="font-medium text-foreground">{peak}</b>{record.decay.fadesBy && <>, gone by {record.decay.fadesBy}</>}{record.decay.tentative && " (few calls)"}.</> : record.settled + record.open > 0 ? " No horizon shows an edge yet." : ""}
      </p>
    </div>
  );
}

/** What following every call would have returned, toggled between the raw return and the return over the market. */
export function FollowCurve({ calls, width = 300, height = 40 }: { calls: Call[]; width?: number; height?: number }) {
  const [mode, setMode] = useState<CurveMode>("alpha");
  const curve = useMemo(() => followCurve(calls, mode), [calls, mode]);
  if (!calls.length) return null;
  const last = curve.values[curve.values.length - 1];
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={label}>Following their calls</span>
        <span style={{ ...neutralAccent, "--control-height-sm": "26px", "--text-sm": "0.75rem" } as CSSProperties}>
          <SegmentedControl label="Follow curve" value={mode} onValueChange={(v) => setMode(v as CurveMode)}
            options={[{ value: "alpha", label: "vs market" }, { value: "raw", label: "Raw" }]} />
        </span>
      </div>
      <Sparkline key={mode} data={curve.values} label={mode === "alpha" ? "Over the market · 3d per call" : "Raw return · 3d per call"} value={signed(last / 100)}
        change={`${calls.length} ${calls.length === 1 ? "call" : "calls"}`} tone={last > 0 ? "success" : last < 0 ? "danger" : "accent"}
        width={width} height={height} labels={curve.dates.map((t) => date(new Date(t).toISOString()))} formatValue={(v) => signed(v / 100)} />
    </div>
  );
}

/**
 * The account view's "vs the market" card: badge, horizon row and follow curve, for the chosen token or for every
 * call the account made.
 */
export function MarketRecordCard({ record, symbol }: { record: TrackRecord | null; symbol: TokenSymbol }) {
  const [scope, setScope] = useState<"token" | "all">("token");
  const tokenRecord = record?.byToken.find((b) => b.token === symbol) ?? null;
  // A token with no calls yet shows every call instead, so the card is never empty when there is something to show.
  const useAll = scope === "all" || !tokenRecord || tokenRecord.settled + tokenRecord.open === 0;
  const shown = useAll ? record?.overall ?? null : tokenRecord;
  const calls = useAll ? record?.calls ?? [] : record?.calls.filter((c) => c.token === symbol) ?? [];
  return (
    <section className={`${card} grid gap-4`} aria-label="Calls against the market">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Calls vs the market</h2>
          <BeatMarketBadge record={shown} />
        </div>
        <span style={{ ...neutralAccent, "--control-height-sm": "30px", "--text-sm": "0.8125rem" } as CSSProperties}>
          <SegmentedControl label="Which calls" value={useAll ? "all" : "token"} onValueChange={(v) => setScope(v as "token" | "all")}
            options={[{ value: "token", label: symbol }, { value: "all", label: "All tokens" }]} />
        </span>
      </div>
      <HorizonRow record={shown} token={useAll ? null : symbol} />
      {calls.length > 0 && <FollowCurve calls={calls} width={640} height={48} />}
    </section>
  );
}
