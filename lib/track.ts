// Track record: was each bullish or bearish call right? Pure functions, used by the page and the MCP server.
import type { Post } from "./sample";
import { TOKENS, type TokenSymbol } from "./stance";

/** [hour start in ms, closing price] pairs, oldest first. */
export type PriceSeries = [number, number][];

/** A call is judged on how the price moved over this many days after the post. */
export const HORIZON_DAYS = 3;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type Call = {
  id: string; token: TokenSymbol; stance: "bullish" | "bearish"; text: string; url?: string;
  postedAt: number; entry: number; exit: number;
  /** Price change from entry to exit, as a fraction. */
  move: number;
  /** The move in the direction the call pointed: positive means the call made money. */
  gain: number;
  /** False while the horizon has not passed yet; exit is then the latest price. */
  settled: boolean;
  right: boolean;
};

export type Tally = { settled: number; right: number; avgGain: number | null; open: number };
export type TokenRecord = Tally & { token: TokenSymbol };
export type TrackRecord = { calls: Call[]; overall: Tally; byToken: TokenRecord[] };

/** When a post was made. Sample posts only know how many days ago, so they get noon UTC of that day. */
export function postTime(p: Post, now = Date.now()): number {
  if (p.postedAt) return Date.parse(p.postedAt);
  const d = new Date(now - p.daysAgo * DAY);
  d.setUTCHours(12, 0, 0, 0);
  return Math.min(d.getTime(), now);
}

/** Close of the hour that contains t, so the call gets no credit for moves before it was posted. */
function priceAt(series: PriceSeries, t: number): number | null {
  let lo = 0, hi = series.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found === -1 || t - series[found][0] > HOUR) return null; // before the history starts, or a gap
  return series[found][1];
}

function summarize(calls: Call[]): Tally {
  const done = calls.filter((c) => c.settled);
  return {
    settled: done.length,
    right: done.filter((c) => c.right).length,
    avgGain: done.length ? done.reduce((s, c) => s + c.gain, 0) / done.length : null,
    open: calls.length - done.length,
  };
}

export function trackRecord(posts: Post[], prices: Partial<Record<TokenSymbol, PriceSeries>>, now = Date.now()): TrackRecord {
  const calls: Call[] = [];
  for (const p of posts) {
    if (!p.token || p.stance === "neutral") continue;
    const series = prices[p.token];
    if (!series?.length) continue;
    const at = postTime(p, now);
    const entry = priceAt(series, at);
    if (entry === null) continue;
    const latest = series[series.length - 1];
    const due = at + HORIZON_DAYS * DAY;
    const settled = due <= latest[0] + HOUR;
    const exit = settled ? priceAt(series, due) : latest[1];
    if (exit === null) continue;
    const move = (exit - entry) / entry;
    const gain = p.stance === "bullish" ? move : -move;
    calls.push({ id: p.id, token: p.token, stance: p.stance, text: p.text, url: p.url, postedAt: at, entry, exit, move, gain, settled, right: gain > 0 });
  }
  calls.sort((a, b) => b.postedAt - a.postedAt);
  return {
    calls,
    overall: summarize(calls),
    byToken: TOKENS.map((token) => ({ token, ...summarize(calls.filter((c) => c.token === token)) })),
  };
}

/**
 * Running total of what following each call would have returned, oldest call first, in percent.
 * Starts at 0 so even one call draws a line. Open calls count at today's price.
 */
export function followCurve(calls: Call[]): { values: number[]; dates: number[] } {
  const ordered = [...calls].sort((a, b) => a.postedAt - b.postedAt);
  const values = [0], dates = [ordered[0]?.postedAt ?? Date.now()];
  for (const c of ordered) { values.push(values[values.length - 1] + c.gain * 100); dates.push(c.postedAt); }
  return { values, dates };
}

/**
 * The account's lean on one token at the end of each of the last `days` days: 0 fully bearish, 50 neutral,
 * 100 fully bullish. Each day uses the same rule as the headline lean (posts from the 7 days before it, each
 * counting half as much every 3 days), so the last point matches the lean shown elsewhere. Days before the first
 * post on the token are null.
 */
export function leanHistory(posts: Post[], token: TokenSymbol, days = 14, now = Date.now()): { values: (number | null)[]; dates: number[] } {
  const about = posts.filter((p) => p.token === token).map((p) => ({ p, at: postTime(p, now) }));
  const values: (number | null)[] = [], dates: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const end = i === 0 ? now : (() => { const d = new Date(now - i * DAY); d.setUTCHours(23, 59, 59, 999); return d.getTime(); })();
    let total = 0, lean = 0;
    for (const { p, at } of about) {
      const age = (end - at) / DAY;
      if (age < 0 || age >= 7) continue;
      const w = p.strength * Math.pow(0.5, age / 3);
      total += w;
      lean += w * (p.stance === "bullish" ? 1 : p.stance === "bearish" ? -1 : 0);
    }
    values.push(total ? 50 + 50 * (lean / total) : null);
    dates.push(end);
  }
  return { values, dates };
}
