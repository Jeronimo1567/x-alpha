// What happened around a call on a main token: the price (Gemini candles) and large-wallet buying and selling
// onchain (QuickNode Streams), from 12 hours before the post to 24 hours after it. Pure functions, used by
// /api/impact, the account page and the MCP server.
import type { Swap } from "./swaps";
import { STREAMS_STARTED } from "./onchain-sources";
import type { PriceSeries } from "./track";

const HOUR = 3_600_000;

export type Bar = { t: number; buyUsd: number; sellUsd: number; trades: number; price: number | null };
export type Flow = { buyUsd: number; sellUsd: number; netUsd: number; trades: number; wallets: number };
export type Flag = { tone: "good" | "bad" | "neutral"; label: string; detail: string };
export type Impact = {
  postAt: number; from: number; to: number; now: number; stance: "bullish" | "bearish";
  bars: Bar[]; bucketMs: number;
  before: Flow; after: Flow;
  priceAtPost: number | null; priceNow: number | null;
  /** Price change since the post, and the same in the call's direction (positive means the call is right so far). */
  change: number | null; callMove: number | null;
  /** Best and worst point after the post, in the call's direction. */
  best: number | null; worst: number | null;
  flags: Flag[];
  simulated: boolean;
  /** Wallets left out as two-way traders (market makers, arbitrage and routing bots), and their volume. */
  excluded: { wallets: number; trades: number; usd: number };
  /** The window ends before the Streams started, so there is no onchain data for this call at all. */
  beforeStreams: boolean;
};

/** A wallet with more swaps than this in one call's window is treated as a bot. */
const MAX_SWAPS_PER_WALLET = 20;
/** Bought and sold within this ratio of each other (smaller side / larger side): two-way, not taking a view. */
const TWO_WAY_RATIO = 0.3;

/**
 * Splits swaps into directional wallets and two-way ones. About half of large-swap volume on these pools comes from
 * wallets that buy and sell similar amounts (market makers, arbitrage and routing bots); counting them buries the
 * wallets that actually took a side.
 */
export function directional(swaps: Swap[]): { kept: Swap[]; excluded: Impact["excluded"] } {
  const byWallet = new Map<string, { buy: number; sell: number; n: number }>();
  for (const s of swaps) {
    const w = byWallet.get(s.wallet) ?? { buy: 0, sell: 0, n: 0 };
    w.n++; if (s.side === "buy") w.buy += s.usd; else w.sell += s.usd;
    byWallet.set(s.wallet, w);
  }
  const out = new Set([...byWallet].filter(([, w]) => w.n > MAX_SWAPS_PER_WALLET || (w.buy > 0 && w.sell > 0 && Math.min(w.buy, w.sell) / Math.max(w.buy, w.sell) >= TWO_WAY_RATIO)).map(([k]) => k));
  const gone = swaps.filter((s) => out.has(s.wallet));
  return { kept: swaps.filter((s) => !out.has(s.wallet)), excluded: { wallets: out.size, trades: gone.length, usd: gone.reduce((a, s) => a + s.usd, 0) } };
}

/** Close of the candle that contains t (the last one at or before it). */
function priceAt(series: PriceSeries, t: number): number | null {
  let lo = 0, hi = series.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (series[mid][0] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found === -1 ? null : series[found][1];
}

function flow(swaps: Swap[]): Flow {
  const buyUsd = swaps.filter((s) => s.side === "buy").reduce((a, s) => a + s.usd, 0);
  const sellUsd = swaps.filter((s) => s.side === "sell").reduce((a, s) => a + s.usd, 0);
  return { buyUsd, sellUsd, netUsd: buyUsd - sellUsd, trades: swaps.length, wallets: new Set(swaps.map((s) => s.wallet)).size };
}

const money = (n: number) => "$" + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(Math.abs(n) / 1e3) + "k" : Math.round(Math.abs(n)));
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1)}%`;

export function postImpact(input: {
  swaps: Swap[]; candles: PriceSeries; postAt: number; stance: "bullish" | "bearish";
  beforeH?: number; afterH?: number; now?: number;
}): Impact {
  const now = input.now ?? Date.now();
  const { postAt, stance, candles } = input;
  const beforeH = input.beforeH ?? 12, afterH = input.afterH ?? 24;
  const from = postAt - beforeH * HOUR, to = postAt + afterH * HOUR;
  const end = Math.min(now, to);
  // Only wallets that took a side count (see directional).
  const { kept: swaps, excluded } = directional(input.swaps.filter((s) => s.time >= from && s.time <= end));
  const beforeStreams = end < STREAMS_STARTED && !input.swaps.some((s) => s.sim);
  const dir = stance === "bullish" ? 1 : -1;

  // Half-hour bars, lined up so one starts exactly at the post.
  const bucketMs = HOUR / 2;
  const bars: Bar[] = [];
  for (let t = from; t <= end; t += bucketMs) {
    const inBar = swaps.filter((s) => s.time >= t && s.time < t + bucketMs);
    bars.push({
      t, trades: inBar.length, price: priceAt(candles, Math.min(t + bucketMs, end)),
      buyUsd: inBar.filter((s) => s.side === "buy").reduce((a, s) => a + s.usd, 0),
      sellUsd: inBar.filter((s) => s.side === "sell").reduce((a, s) => a + s.usd, 0),
    });
  }

  const before = flow(swaps.filter((s) => s.time < postAt)), after = flow(swaps.filter((s) => s.time >= postAt));
  const priceAtPost = priceAt(candles, postAt), priceNow = priceAt(candles, end);
  const change = priceAtPost && priceNow ? priceNow / priceAtPost - 1 : null;
  const callMove = change === null ? null : change * dir;
  const moves = priceAtPost ? bars.filter((b) => b.t >= postAt && b.price !== null).map((b) => (b.price! / priceAtPost - 1) * dir) : [];
  const best = moves.length ? Math.max(...moves) : null, worst = moves.length ? Math.min(...moves) : null;

  const flags: Flag[] = [];
  if (now > postAt && callMove !== null && Math.abs(callMove) >= 0.003) {
    flags.push(callMove > 0
      ? { tone: "good", label: now >= to ? "Right" : "Right so far", detail: `${pct(change!)} since the post${now >= to ? " (24h)" : ""}, the way the call pointed.` }
      : { tone: "bad", label: now >= to ? "Wrong" : "Wrong so far", detail: `${pct(change!)} since the post${now >= to ? " (24h)" : ""}, against the call.` });
  }
  const side = stance === "bullish" ? "bought" : "sold";
  const against = stance === "bullish" ? "sold" : "bought";
  if (after.trades >= 3 && after.buyUsd + after.sellUsd > 0) {
    const share = (after.netUsd * dir) / (after.buyUsd + after.sellUsd);
    if (share >= 0.1) flags.push({ tone: "good", label: "Big wallets agreed", detail: `Net ${money(after.netUsd)} ${side} after the post by wallets taking a side.` });
    else if (share <= -0.1) flags.push({ tone: "bad", label: "Big wallets went the other way", detail: `Net ${money(after.netUsd)} ${against} after the post by wallets taking a side.` });
    else flags.push({ tone: "neutral", label: "No clear onchain side", detail: "Large buying and selling roughly balanced after the post." });
  } else if (beforeStreams) {
    flags.push({ tone: "neutral", label: "Before onchain tracking", detail: `X Alpha's QuickNode Streams started ${new Date(STREAMS_STARTED).toLocaleDateString("en-US", { month: "short", day: "numeric" })}; this call is older, so there is no onchain flow for it.` });
  } else if (now > postAt) {
    flags.push({ tone: "neutral", label: "Waiting for large swaps", detail: "Too few large swaps from wallets taking a side since the post." });
  }
  if (before.trades >= 3 && before.buyUsd + before.sellUsd > 0 && (before.netUsd * dir) / (before.buyUsd + before.sellUsd) >= 0.2) {
    flags.push({ tone: "neutral", label: "Big wallets moved first", detail: `Net ${money(before.netUsd)} ${side} in the 12 hours before the post.` });
  }

  return { postAt, from, to, now, stance, bars, bucketMs, before, after, priceAtPost, priceNow, change, callMove, best, worst, flags, simulated: input.swaps.some((s) => s.sim && s.time >= from && s.time <= end), excluded, beforeStreams };
}
