"use client";
// "Did they beat the market?" as two lines, the way fund factsheets show a fund against its benchmark: following
// the account's calls vs riding the market the same way, with the gap between them (their alpha) shaded.

import { useMemo, useState } from "react";
import { LineChart, type LineChartDatum } from "@/components/arc/line-chart/line-chart";
import { XAlphaLogo } from "@/components/x-alpha-logo";
import { date } from "@/components/shared";
import { HORIZONS, MAIN_HORIZON, type Call, type HorizonKey, type Scorecard } from "@/lib/track";

const signed1 = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1) + "%";

/** "11 of 18 calls beat the market over 3 days." */
export function Consistency({ record, horizon = MAIN_HORIZON }: { record: Scorecard | null; horizon?: HorizonKey }) {
  const t = record?.horizons[horizon];
  if (!t || !t.benchmarked) return null;
  const label = HORIZONS.find((h) => h.key === horizon)!.label;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-semibold text-foreground tabular-nums">{t.beat} of {t.benchmarked}</span> calls beat the market over {label}.
    </p>
  );
}

/**
 * Two running totals over their calls (oldest first, 3 days each): what following them returned, and what riding the
 * market the same way returned. The gap between them is their alpha. Drawn with the same LineChart as the price chart,
 * so it scrubs the same way; the headline follows the crosshair.
 */
export function VsMarketLines({ calls, name }: { calls: Call[]; name: string }) {
  const [active, setActive] = useState<number | null>(null);
  const view = useMemo(() => {
    const ordered = [...calls].filter((c) => c.horizons[MAIN_HORIZON]?.benchmark != null).sort((a, b) => a.postedAt - b.postedAt);
    let them = 0, market = 0, lastDay = "";
    const data: LineChartDatum[] = [{ key: "start", label: "Before their first call", values: { them: 0, market: 0 } }];
    ordered.forEach((c, i) => {
      const g = c.horizons[MAIN_HORIZON]!;
      const dir = c.stance === "bullish" ? 1 : -1;
      them += g.gain * 100;
      market += dir * g.benchmark! * 100;
      const day = date(new Date(c.postedAt).toISOString());
      data.push({ key: `${c.id}-${i}`, label: `Call ${i + 1} · ${c.stance} ${c.token} · ${day}`, axisLabel: day !== lastDay ? day : undefined, values: { them, market } });
      lastDay = day;
    });
    return { data, n: ordered.length };
  }, [calls]);
  if (view.n === 0) return null;

  // Headline: the end totals, or the point under the crosshair while scrubbing.
  const point = view.data[active ?? view.data.length - 1].values;
  const them = point.them ?? 0, market = point.market ?? 0, gap = them - market;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-foreground" />Following {name} <b className="tabular-nums">{signed1(them)}</b></span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" />Riding the market <b className="font-medium tabular-nums">{signed1(market)}</b></span>
        </span>
        <span className={`flex items-center gap-1 font-semibold tabular-nums ${gap > 0 ? "text-good" : gap < 0 ? "text-bad" : ""}`}>
          <XAlphaLogo className="h-3 w-auto" />{signed1(gap)} alpha
        </span>
      </div>
      <LineChart label={`Following ${name} vs riding the market`} categoryLabel="Call" data={view.data} height={200} legend={false} curve="linear"
        series={[
          { key: "them", label: `Following ${name}`, color: "var(--foreground)", area: false },
          { key: "market", label: "Riding the market", color: "var(--muted-foreground)", dashed: true, area: false },
        ]}
        formatValue={(v) => signed1(v)} formatTick={(v) => signed1(v)}
        onActiveChange={(i) => setActive(i)} />
      <p className="text-[11px] text-muted-foreground">{view.n} calls · each held 3 days · drag across the chart to see the running totals</p>
    </div>
  );
}
