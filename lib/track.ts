// Track record: was each bullish or bearish call right, and did it beat the market? Pure functions, used by the
// page, the pick engine and the MCP server.
//
// Two ways to grade a call:
//   gain  = the price move in the call's direction ("raw"). In a rising market every bull looks smart this way.
//   alpha = gain minus what the market did over the same window, in the call's direction. A bull on SOL that rose
//           4% while BTC rose 5% made money but had no edge: alpha is −1%.
// Each call is graded at several horizons (HORIZONS) so you can see how fast an account's edge shows up and when
// it fades. `gain`, `right` and `settled` on a Call stay the 3-day raw grade the rest of the app always used.
import type { Post } from "./sample";
import { TOKENS, type TokenSymbol } from "./stance";

/** [hour start in ms, closing price] pairs, oldest first. */
export type PriceSeries = [number, number][];
export type Prices = Partial<Record<TokenSymbol, PriceSeries>>;

/** A call is judged on how the price moved over this many days after the post (the headline grade). */
export const HORIZON_DAYS = 3;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The horizons every call is also graded at, shortest first. */
export const HORIZONS = [
  { key: "1h", ms: HOUR, label: "1 hour" },
  { key: "1d", ms: DAY, label: "1 day" },
  { key: "3d", ms: 3 * DAY, label: "3 days" },
  { key: "7d", ms: 7 * DAY, label: "7 days" },
] as const;
export type HorizonKey = (typeof HORIZONS)[number]["key"];
/** The horizon that matches HORIZON_DAYS, so the headline grade and the horizon grades agree. */
export const MAIN_HORIZON: HorizonKey = "3d";
/** Fewer settled calls than this and a hit rate or mean says little; the pick engine falls back, the UI says so. */
export const MIN_SETTLED = 5;

/** One call graded over one horizon. */
export type Graded = {
  /** Price change of the called token from entry to the end of the window, as a fraction. */
  move: number;
  /** The move in the direction the call pointed: positive means the call made money. */
  gain: number;
  /** The market's move over the same window (see benchmarkMove), or null when its prices are missing. */
  benchmark: number | null;
  /** gain − direction × benchmark: what the call earned over just riding the market the same way. */
  alpha: number | null;
  /** False while the window has not passed yet; the end is then the latest price. */
  settled: boolean;
};

export type Call = {
  id: string; token: TokenSymbol; stance: "bullish" | "bearish"; text: string; url?: string;
  postedAt: number; entry: number; exit: number;
  /** Price change from entry to exit, as a fraction (3-day window). */
  move: number;
  /** The move in the direction the call pointed: positive means the call made money (3-day window). */
  gain: number;
  /** False while the horizon has not passed yet; exit is then the latest price. */
  settled: boolean;
  right: boolean;
  /** The same call graded at every horizon, with the market taken out. Missing when that window has no price. */
  horizons: Partial<Record<HorizonKey, Graded>>;
};

/** How solid a mean alpha looks: too few calls, or its t-stat bucketed. */
export type Signal = "too few" | "noise" | "weak" | "strong";

export type HorizonTally = {
  horizon: HorizonKey;
  /** Settled calls at this horizon, and how many made money. */
  settled: number; right: number;
  /** Settled calls with a market move to compare, and how many beat it (alpha > 0). */
  benchmarked: number; beat: number;
  hitRate: number | null; alphaHitRate: number | null;
  meanGain: number | null; meanAlpha: number | null;
  /** Mean alpha over its standard error. Rough: calls close together overlap, so it flatters a busy account. */
  tStat: number | null;
  signal: Signal;
};

/** Where an account's edge is biggest, and the first longer horizon where it is gone. */
export type EdgeDecay = { peak: HorizonKey | null; fadesBy: HorizonKey | null; tentative: boolean };

export type Tally = { settled: number; right: number; avgGain: number | null; open: number };
/** The 3-day Tally plus the multi-horizon, market-relative grade. */
export type Scorecard = Tally & { horizons: Record<HorizonKey, HorizonTally>; decay: EdgeDecay };
export type TokenRecord = Scorecard & { token: TokenSymbol };
export type TrackRecord = { calls: Call[]; overall: Scorecard; byToken: TokenRecord[] };

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

function moveBetween(series: PriceSeries | undefined, from: number, to: number): number | null {
  if (!series?.length) return null;
  const a = priceAt(series, from), b = priceAt(series, to);
  return a === null || b === null ? null : (b - a) / a;
}

/**
 * What "the market" did between two times, for a call on `token`. One place decides the benchmark:
 *
 * - Altcoins (ETH, SOL, XRP, ZEC, HYPE) are measured against BTC. BTC is what crypto beta is: when it moves, alts
 *   mostly move with it, so an alt call only has an edge if it beat what owning BTC did.
 * - BTC calls are measured against an equal-weighted basket of every tracked token (BTC included), a small crypto
 *   index. BTC can't be its own benchmark (alpha would always be 0); against the basket a BTC call earns alpha when
 *   BTC beat the rest of crypto in the direction called. We keep BTC in the basket rather than use "BTC minus the
 *   alts" so the benchmark is a portfolio someone could actually hold, and its move is never just the call's own move
 *   flipped. Tokens without prices for the window are left out; with fewer than two, there is no benchmark.
 */
export function benchmarkMove(token: TokenSymbol, from: number, to: number, prices: Prices): number | null {
  if (token !== "BTC") return moveBetween(prices.BTC, from, to);
  const moves = TOKENS.map((t) => moveBetween(prices[t], from, to)).filter((m): m is number => m !== null);
  return moves.length >= 2 ? moves.reduce((s, m) => s + m, 0) / moves.length : null;
}

/** Grades one call over one window. Unsettled windows end at the token's latest candle. */
function grade(token: TokenSymbol, dir: 1 | -1, at: number, entry: number, ms: number, prices: Prices): Graded | null {
  const series = prices[token]!;
  const latest = series[series.length - 1];
  const due = at + ms;
  const settled = due <= latest[0] + HOUR;
  const end = settled ? due : latest[0];
  const exit = settled ? priceAt(series, due) : latest[1];
  if (exit === null) return null;
  const move = (exit - entry) / entry;
  const gain = dir * move;
  const benchmark = benchmarkMove(token, at, end, prices);
  return { move, gain, benchmark, alpha: benchmark === null ? null : gain - dir * benchmark, settled };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function tallyHorizon(calls: Call[], horizon: HorizonKey): HorizonTally {
  const done = calls.map((c) => c.horizons[horizon]).filter((g): g is Graded => !!g?.settled);
  const alphas = done.map((g) => g.alpha).filter((a): a is number => a !== null);
  const meanAlpha = mean(alphas);
  let tStat: number | null = null;
  if (alphas.length >= 2 && meanAlpha !== null) {
    const sd = Math.sqrt(alphas.reduce((s, a) => s + (a - meanAlpha) ** 2, 0) / (alphas.length - 1));
    tStat = sd > 0 ? meanAlpha / (sd / Math.sqrt(alphas.length)) : null;
  }
  const signal: Signal = alphas.length < MIN_SETTLED ? "too few" : tStat === null || Math.abs(tStat) < 1 ? "noise" : Math.abs(tStat) < 2 ? "weak" : "strong";
  const right = done.filter((g) => g.gain > 0).length, beat = alphas.filter((a) => a > 0).length;
  return {
    horizon, settled: done.length, right, benchmarked: alphas.length, beat,
    hitRate: done.length ? right / done.length : null, alphaHitRate: alphas.length ? beat / alphas.length : null,
    meanGain: mean(done.map((g) => g.gain)), meanAlpha, tStat, signal,
  };
}

/**
 * Edge decay: the horizon where mean alpha peaks, and the first longer one where it has dropped to zero or below.
 * Only horizons with MIN_SETTLED settled calls count; when none has that many, every horizon with a call counts and
 * the answer is marked tentative.
 */
export function edgeDecay(horizons: Record<HorizonKey, HorizonTally>): EdgeDecay {
  const all = HORIZONS.map((h) => horizons[h.key]).filter((t) => t.meanAlpha !== null);
  const solid = all.filter((t) => t.benchmarked >= MIN_SETTLED);
  const pool = solid.length ? solid : all;
  if (!pool.length) return { peak: null, fadesBy: null, tentative: true };
  const best = pool.reduce((a, b) => (b.meanAlpha! > a.meanAlpha! ? b : a));
  if (best.meanAlpha! <= 0) return { peak: null, fadesBy: null, tentative: !solid.length };
  const after = pool.slice(pool.indexOf(best) + 1).find((t) => t.meanAlpha! <= 0);
  return { peak: best.horizon, fadesBy: after?.horizon ?? null, tentative: !solid.length };
}

function summarize(calls: Call[]): Scorecard {
  const done = calls.filter((c) => c.settled);
  const horizons = Object.fromEntries(HORIZONS.map((h) => [h.key, tallyHorizon(calls, h.key)])) as Record<HorizonKey, HorizonTally>;
  return {
    settled: done.length,
    right: done.filter((c) => c.right).length,
    avgGain: done.length ? done.reduce((s, c) => s + c.gain, 0) / done.length : null,
    open: calls.length - done.length,
    horizons,
    decay: edgeDecay(horizons),
  };
}

export function trackRecord(posts: Post[], prices: Prices, now = Date.now()): TrackRecord {
  const calls: Call[] = [];
  for (const p of posts) {
    if (!p.token || p.stance === "neutral") continue;
    const series = prices[p.token];
    if (!series?.length) continue;
    const at = postTime(p, now);
    const entry = priceAt(series, at);
    if (entry === null) continue;
    const dir = p.stance === "bullish" ? 1 : -1;
    const horizons: Call["horizons"] = {};
    for (const h of HORIZONS) { const g = grade(p.token, dir, at, entry, h.ms, prices); if (g) horizons[h.key] = g; }
    const main = horizons[MAIN_HORIZON];
    if (!main) continue;
    const exit = entry * (1 + main.move);
    calls.push({
      id: p.id, token: p.token, stance: p.stance, text: p.text, url: p.url, postedAt: at, entry, exit,
      move: main.move, gain: main.gain, settled: main.settled, right: main.gain > 0, horizons,
    });
  }
  calls.sort((a, b) => b.postedAt - a.postedAt);
  return {
    calls,
    overall: summarize(calls),
    byToken: TOKENS.map((token) => ({ token, ...summarize(calls.filter((c) => c.token === token)) })),
  };
}

export type MarketVerdict = {
  /**
   * beats:   mean alpha above zero with a t-stat of 2+ at some horizon, or 1+ at the main 3-day grade (MIN_SETTLED+
   *          calls). A single weak blip at one short horizon is not enough.
   * rides:   mostly right on price (3-day hit rate 60%+) but no edge over the market: right because the market moved.
   * trails:  mean alpha at or below zero at every horizon with enough calls.
   * unclear: some positive alpha, but too noisy to call.
   * few:     no horizon has MIN_SETTLED calls with a market move to compare.
   */
  kind: "beats" | "rides" | "trails" | "unclear" | "few";
  /** The horizon the verdict rests on: where the edge is (beats) or the 3-day grade. */
  horizon: HorizonKey | null;
};

/** One plain verdict on whether an account's calls beat the market, for a badge or an agent. */
export function marketVerdict(s: Scorecard): MarketVerdict {
  const solid = HORIZONS.map((h) => s.horizons[h.key]).filter((t) => t.benchmarked >= MIN_SETTLED && t.meanAlpha !== null);
  if (!solid.length) return { kind: "few", horizon: null };
  const edges = solid.filter((t) => t.meanAlpha! > 0 && (t.tStat ?? 0) >= (t.horizon === MAIN_HORIZON ? 1 : 2));
  if (edges.length) return { kind: "beats", horizon: edges.reduce((a, b) => (b.meanAlpha! > a.meanAlpha! ? b : a)).horizon };
  const main = s.horizons[MAIN_HORIZON];
  if ((main.hitRate ?? 0) >= 0.6 && main.benchmarked >= MIN_SETTLED && main.meanAlpha! <= 0) return { kind: "rides", horizon: MAIN_HORIZON };
  if (solid.every((t) => t.meanAlpha! <= 0)) return { kind: "trails", horizon: MAIN_HORIZON };
  return { kind: "unclear", horizon: null };
}

/** The horizon closest to a span of time (on a log scale), e.g. a contract settling in 20 hours → "1d". */
export function horizonFor(ms: number): HorizonKey {
  const t = Math.max(ms, 1);
  return HORIZONS.reduce((a, b) => (Math.abs(Math.log(b.ms / t)) < Math.abs(Math.log(a.ms / t)) ? b : a)).key;
}

export type CurveMode = "raw" | "alpha";

/**
 * Running total of what following each call would have returned, oldest call first, in percent.
 * Starts at 0 so even one call draws a line. Open calls count at today's price.
 * "alpha" sums each call's 3-day alpha instead: what following them earned over just holding the market.
 */
export function followCurve(calls: Call[], mode: CurveMode = "raw"): { values: number[]; dates: number[] } {
  const ordered = [...calls].sort((a, b) => a.postedAt - b.postedAt);
  const values = [0], dates = [ordered[0]?.postedAt ?? Date.now()];
  for (const c of ordered) {
    const step = mode === "alpha" ? c.horizons[MAIN_HORIZON]?.alpha ?? 0 : c.gain;
    values.push(values[values.length - 1] + step * 100);
    dates.push(c.postedAt);
  }
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
