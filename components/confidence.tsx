"use client";

import { credibilityDetail, type Credibility } from "@/lib/pick";
import type { TokenSymbol } from "@/lib/stance";
import { HORIZONS, type Call, type HorizonKey, type Scorecard, type Tally } from "@/lib/track";
import { label, signed } from "@/components/shared";

/** What the confidence rests on, in one line: calls that beat the market, or (too few of those) calls that made money. */
function basisText(c: Credibility, symbol: TokenSymbol) {
  const over = HORIZONS.find((h) => h.key === c.horizon)!.label;
  if (!c.n) return `No ${symbol} calls old enough to judge over ${over} yet`;
  return c.basis === "alpha"
    ? `${c.hits} of ${c.n} past ${symbol} calls beat the market over ${over}`
    : `${c.hits} of ${c.n} past ${symbol} calls right over ${over}${c.n < 5 ? " · few calls, held back" : ""}`;
}

/** Plain-language level for how much an account's view counts. */
export function confidenceLevel(c: number) {
  return c >= 0.75 ? "High" : c >= 0.45 ? "Medium" : c > 0.1 ? "Low" : "None";
}

/** Five steps, filled to the confidence. Monochrome: colour stays for the lean and the bet. */
export function ConfidenceMeter({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-2.5 w-1.5 rounded-[2px] ${i < filled ? "bg-foreground" : "bg-foreground/15"}`} />
      ))}
    </span>
  );
}

/**
 * How much the account's past calls on this token earn its view, shown before the odds it moves:
 * a level and meter, one dot per judged call (filled right, hollow wrong), and the count.
 */
export function Confidence({ record, calls, symbol, horizon }: { record: Tally | Scorecard | null; calls: Call[]; symbol: TokenSymbol; horizon?: HorizonKey }) {
  const detail = credibilityDetail(record, horizon);
  const value = detail.value;
  const level = confidenceLevel(value);
  const alpha = detail.basis === "alpha";
  // One dot per judged call at the horizon used: filled when it was a hit on that basis.
  const judged = calls.map((c) => ({ c, g: c.horizons[detail.horizon] })).filter(({ g }) => g?.settled && (!alpha || g.alpha !== null)).sort((a, b) => a.c.postedAt - b.c.postedAt)
    .map(({ c, g }) => ({ c, hit: alpha ? g!.alpha! > 0 : g!.gain > 0, by: alpha ? g!.alpha! : g!.gain }));
  const share = `${Math.round(value * 100)}%`;

  return (
    <div className="grid gap-2 rounded-md bg-foreground/[0.03] p-3" aria-label={`Confidence: ${level}, ${share}`}>
      <span className={label}>Confidence from past calls</span>
      {/* The percentage leads, big; the level and meter sit beside it. */}
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none font-semibold tabular-nums">{share}</span>
        <span className="flex items-center gap-2 rounded-md bg-foreground/[0.06] px-2 py-1">
          <ConfidenceMeter value={value} />
          <span className="text-sm font-semibold">{level}</span>
        </span>
      </div>
      {judged.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label={`${detail.hits} hits, ${detail.n - detail.hits} misses`}>
          {judged.map(({ c, hit, by }) => (
            <a key={c.id} href={c.url} target="_blank" rel="noreferrer" onClick={(e) => { if (!c.url) e.preventDefault(); }}
              title={`${alpha ? (hit ? "Beat the market" : "Trailed the market") : hit ? "Right" : "Wrong"} ${signed(by)}: ${c.text}`}
              className={`size-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${hit ? "bg-foreground" : "ring-1 ring-foreground/50 ring-inset"}`} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {basisText(detail, symbol)}
      </p>
    </div>
  );
}

/** The same confidence, small enough to sit inside the source post: meter, percentage and level, details on hover. */
export function ConfidenceBadge({ record, symbol, horizon }: { record: Tally | Scorecard | null; symbol: TokenSymbol; horizon?: HorizonKey }) {
  const c = credibilityDetail(record, horizon);
  const value = c.value;
  const level = confidenceLevel(value);
  const share = `${Math.round(value * 100)}%`;
  const detail = basisText(c, symbol);
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-foreground/[0.05] py-1 pr-2.5 pl-2 text-xs ring-1 ring-foreground/10 ring-inset" title={`Confidence from past calls: ${detail}`} aria-label={`Confidence ${level}, ${share}. ${detail}`}>
      <span className="text-muted-foreground">Confidence</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
        <span className="block h-full rounded-full bg-foreground" style={{ width: share }} />
      </span>
      <span className="font-semibold tabular-nums">{share}</span>
      <span className="text-muted-foreground">· {level}</span>
    </span>
  );
}
