"use client";

import { credibilityOf } from "@/lib/pick";
import type { TokenSymbol } from "@/lib/stance";
import type { Call, Tally } from "@/lib/track";
import { label, signed } from "@/components/shared";

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
export function Confidence({ record, calls, symbol }: { record: Tally | null; calls: Call[]; symbol: TokenSymbol }) {
  const value = credibilityOf(record);
  const level = confidenceLevel(value);
  const settled = record?.settled ?? 0, right = record?.right ?? 0;
  const judged = calls.filter((c) => c.settled).sort((a, b) => a.postedAt - b.postedAt);
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
        <div className="flex flex-wrap gap-1" aria-label={`${right} right, ${settled - right} wrong`}>
          {judged.map((c) => (
            <a key={c.id} href={c.url} target="_blank" rel="noreferrer" onClick={(e) => { if (!c.url) e.preventDefault(); }}
              title={`${c.right ? "Right" : "Wrong"} ${signed(c.gain)}: ${c.text}`}
              className={`size-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${c.right ? "bg-foreground" : "ring-1 ring-foreground/50 ring-inset"}`} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {settled ? <>{right} of {settled} past {symbol} calls right{settled < 5 && " · few calls, held back"}</> : `No ${symbol} calls old enough to judge yet`}
      </p>
    </div>
  );
}

/** The same confidence, small enough to sit inside the source post: meter, percentage and level, details on hover. */
export function ConfidenceBadge({ record, symbol }: { record: Tally | null; symbol: TokenSymbol }) {
  const value = credibilityOf(record);
  const level = confidenceLevel(value);
  const settled = record?.settled ?? 0, right = record?.right ?? 0;
  const share = `${Math.round(value * 100)}%`;
  const detail = settled ? `${right} of ${settled} past ${symbol} calls right${settled < 5 ? " · few calls, held back" : ""}` : `No ${symbol} calls old enough to judge yet`;
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
