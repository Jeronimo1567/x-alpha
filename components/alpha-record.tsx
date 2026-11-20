"use client";
// Calls graded against the market (lib/track): the beat-the-market badge, one cell per horizon with alpha hit rate
// and mean alpha, and the follow curve with a raw / alpha toggle. Used by the account view, Compare and the dashboard.

import { useMemo, useState, type CSSProperties } from "react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { EvidenceHeader } from "@/components/evidence-header";
import { XAlphaLogo } from "@/components/x-alpha-logo";
import { Consistency, VsMarketLines } from "@/components/vs-market";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { card, date, neutralAccent, signed } from "@/components/shared";
import type { TokenSymbol } from "@/lib/stance";
import { followCurve, HORIZONS, marketVerdict, MIN_SETTLED, type Call, type CurveMode, type HorizonKey, type MarketVerdict, type Scorecard, type TrackRecord } from "@/lib/track";

const horizonLabel = (h: HorizonKey) => HORIZONS.find((x) => x.key === h)!.label;
const tone = (n: number | null | undefined) => (n == null ? "" : n > 0 ? "text-good" : n < 0 ? "text-bad" : "");
const pct0 = (n: number) => `${Math.round(n * 100)}%`;
/** Alpha is often a fraction of a percent, so it gets two decimals where a price move gets one. */
const signed2 = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n * 100).toFixed(2) + "%";

/** What the market means for a token's calls, in a few words. */
export const benchmarkName = (token: TokenSymbol | null) => (token === "BTC" ? "an equal-weight basket of all 6 coins" : token ? "BTC" : "BTC (or the 6-coin basket, for BTC calls)");

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
export function HorizonRow({ record, token, mode = "alpha" }: { record: Scorecard | null; token: TokenSymbol | null; mode?: CurveMode }) {
  if (mode === "raw") return <RawHorizonRow record={record} />;
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
            // One number per box: the average alpha per call. The rest (share that beat the market, plain hit rate,
            // call count, t-stat) is on hover.
            <div key={h.key} className={`grid gap-1 rounded-lg px-3 py-2 ${peak === h.key ? "bg-foreground/[0.06] ring-1 ring-foreground/20" : "bg-foreground/[0.03]"}`}
              title={t.settled ? `Average alpha per call over ${h.label}: ${t.meanAlpha !== null ? signed2(t.meanAlpha) : "–"}. ${t.beat} of ${t.benchmarked} calls beat the market; ${t.right} of ${t.settled} made money.${t.tStat !== null ? ` t = ${t.tStat.toFixed(1)}.` : ""}` : `No call has had ${h.label} to play out yet.`}>
              <dt className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{h.key}</span>
                {few && t.settled > 0 && <span>few calls</span>}
              </dt>
              <dd className={`text-lg leading-none font-semibold tabular-nums ${few ? "text-muted-foreground" : tone(t.meanAlpha)}`}>
                {t.meanAlpha !== null ? signed2(t.meanAlpha) : "–"}
              </dd>
              <dd className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <XAlphaLogo className="h-2.5 w-auto" />alpha
              </dd>
            </div>
          );
        })}
      </dl>
      {peak && (
        <p className="text-[11px] text-muted-foreground">
          Edge peaks at <b className="font-medium text-foreground">{peak}</b>{record.decay.fadesBy && <>, gone by {record.decay.fadesBy}</>}{record.decay.tentative && " (few calls)"}.
        </p>
      )}
    </div>
  );
}

/** The plain record per horizon: share of calls that made money (big) and the average move in the call's direction. */
function RawHorizonRow({ record }: { record: Scorecard | null }) {
  if (!record) return <div className="text-xs text-muted-foreground">Loading prices…</div>;
  return (
    <div className="@container grid gap-1.5">
      <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {HORIZONS.map((h) => {
          const t = record.horizons[h.key];
          const few = t.signal === "too few";
          return (
            <div key={h.key} className="grid gap-1 rounded-lg bg-foreground/[0.03] px-3 py-2"
              title={t.settled ? `${t.right} of ${t.settled} made money over ${h.label}. Average move in their direction: ${t.meanGain !== null ? signed2(t.meanGain) : "–"}.` : `No call has had ${h.label} to play out yet.`}>
              <dt className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{h.key}</span>
                {few && t.settled > 0 && <span>few calls</span>}
              </dt>
              <dd className={`text-lg leading-none font-semibold tabular-nums ${few ? "text-muted-foreground" : ""}`}>{t.hitRate !== null ? pct0(t.hitRate) : "–"}</dd>
              <dd className="text-[11px] text-muted-foreground">right</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** What following every call would have returned, toggled between the raw return and the return over the market. */
export function FollowCurve({ calls, width = 300, height = 40, fixed }: { calls: Call[]; width?: number; height?: number; fixed?: CurveMode }) {
  const [picked, setMode] = useState<CurveMode>("alpha");
  const mode = fixed ?? picked;
  const curve = useMemo(() => followCurve(calls, mode), [calls, mode]);
  if (!calls.length) return null;
  const last = curve.values[curve.values.length - 1];
  return (
    <div className="grid gap-1.5">
      {!fixed && (
        <div className="flex justify-end" style={{ ...neutralAccent, "--control-height-sm": "26px", "--text-sm": "0.75rem" } as CSSProperties}>
          <SegmentedControl label="Follow curve" value={mode} onValueChange={(v) => setMode(v as CurveMode)}
            options={[{ value: "alpha", label: "vs market" }, { value: "raw", label: "Raw" }]} />
        </div>
      )}
      <Sparkline key={mode} data={curve.values} label={mode === "alpha" ? "Following their calls, over the market" : "Following their calls"} value={signed(last / 100)}
        change={`${calls.length} ${calls.length === 1 ? "call" : "calls"}`} tone={last > 0 ? "success" : last < 0 ? "danger" : "accent"}
        width={width} height={height} labels={curve.dates.map((t) => date(new Date(t).toISOString()))} formatValue={(v) => signed(v / 100)} />
    </div>
  );
}

/**
 * The track record card for the token picked above: "raw" (were they right?) or "alpha" (did they beat the market?),
 * with the horizon row and the follow curve.
 */
export function MarketRecordCard({ record, symbol, mode = "alpha", fixedCurve, compact = false, name = "them" }: {
  record: TrackRecord | null; symbol: TokenSymbol;
  /** The account's display name, for the lines chart's legend. */
  name?: string;
  /** "raw": the plain "were they right?" record. "alpha": against the market. */
  mode?: CurveMode;
  /** Pins the follow curve to one mode and hides its toggle (the tabbed layout already picks the view). */
  fixedCurve?: CurveMode;
  /** Half-width (next to the Onchain card): shorter curve. */
  compact?: boolean;
}) {
  const raw = mode === "raw";
  const shown = record?.byToken.find((b) => b.token === symbol) ?? null;
  const calls = record?.calls.filter((c) => c.token === symbol) ?? [];
  // Says up front that this is every call on the token, not the latest one.
  const first = calls.length ? Math.min(...calls.map((c) => c.postedAt)) : null;
  const scope = calls.length ? <>All {calls.length} {symbol} {calls.length === 1 ? "call" : "calls"} since {date(new Date(first!).toISOString())}: </> : null;
  return (
    <section className={`${card} grid content-start gap-4`} aria-label={raw ? "Track record" : "Calls against the market"}>
      {raw
        ? <EvidenceHeader title="Track record" source="gemini" question="Did the price go the way they called?"
            detail={<>{scope}how often the price moved their way 1 hour, 1 day, 3 days and 7 days after each post, from Gemini&apos;s hourly prices.</>} />
        : <EvidenceHeader title="Calls vs the market" badge={<BeatMarketBadge record={shown} />} source="gemini" question="Did they beat just holding the market?"
            detail={<>{scope}following each call for 3 days against riding {benchmarkName(symbol)} the same way, from Gemini&apos;s hourly prices.</>} />}
      {record && calls.length === 0
        ? <p className="rounded-lg bg-foreground/[0.03] px-3 py-6 text-center text-sm text-muted-foreground">No {symbol} calls to grade yet. Pick another token above.</p>
        : raw ? <>
            <HorizonRow record={shown} token={symbol} mode={mode} />
            {calls.length > 0 && <FollowCurve calls={calls} width={compact ? 420 : 640} height={compact ? 64 : 48} fixed={fixedCurve} />}
          </>
        : <>
            {/* Following them vs riding the market the same way; the shaded gap is their alpha. */}
            <VsMarketLines calls={calls} name={name} />
            <Consistency record={shown} />
          </>}
    </section>
  );
}
