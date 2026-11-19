// Hourly price history from Gemini's public candles API (about 60 days back). No key needed.
import { TOKENS, type TokenSymbol } from "./stance";
import type { PriceSeries } from "./track";

const TTL_MS = 5 * 60_000;
const cache = new Map<TokenSymbol, { at: number; series: PriceSeries }>();

/** [hour start in ms, closing price] pairs, oldest first. Cached for 5 minutes. */
export async function hourlyPrices(symbol: TokenSymbol): Promise<PriceSeries> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.series;
  const res = await fetch(`https://api.gemini.com/v2/candles/${symbol.toLowerCase()}usd/1hr`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gemini price history returned ${res.status}`);
  const rows: number[][] = await res.json();
  const series: PriceSeries = rows.map((r) => [r[0], r[4]] as [number, number]).sort((a, b) => a[0] - b[0]);
  cache.set(symbol, { at: Date.now(), series });
  return series;
}

/** Price history for every tracked token. A token that fails to load is left out. */
export async function allPrices(): Promise<Partial<Record<TokenSymbol, PriceSeries>>> {
  const out: Partial<Record<TokenSymbol, PriceSeries>> = {};
  await Promise.all(TOKENS.map(async (s) => { try { out[s] = await hourlyPrices(s); } catch { /* skip */ } }));
  return out;
}

const fineCache = new Map<TokenSymbol, { at: number; series: PriceSeries }>();

/**
 * Prices fine enough to see a single post: 15-minute closes (about two weeks back), falling back to hourly closes
 * for anything older. [candle start in ms, close] pairs, oldest first.
 */
export async function pricesAround(symbol: TokenSymbol, from: number): Promise<PriceSeries> {
  let hit = fineCache.get(symbol);
  if (!hit || Date.now() - hit.at > 60_000) {
    const res = await fetch(`https://api.gemini.com/v2/candles/${symbol.toLowerCase()}usd/15m`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Gemini 15-minute candles returned ${res.status}`);
    const rows: number[][] = await res.json();
    hit = { at: Date.now(), series: rows.map((r) => [r[0], r[4]] as [number, number]).sort((a, b) => a[0] - b[0]) };
    fineCache.set(symbol, hit);
  }
  return hit.series.length && hit.series[0][0] <= from ? hit.series : hourlyPrices(symbol);
}
