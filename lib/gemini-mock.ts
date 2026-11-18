// FAKE Gemini data for UI work while the Gemini API is down.
// Turned on with GEMINI_MOCK=1 (e.g. in .env.local). Nothing here is a real price.
import type { TokenSymbol } from "./stance";
import type { PriceSeries } from "./track";

export const geminiMock = process.env.GEMINI_MOCK === "1";

const BASE: Record<string, number> = { BTC: 96_400, ETH: 3_420, SOL: 182, XRP: 2.31, ZEC: 950, HYPE: 68 };
const STEP: Record<string, number> = { BTC: 500, ETH: 25, SOL: 2, XRP: 0.02, ZEC: 10, HYPE: 0.5 };

/** Small deterministic PRNG so the fake chart doesn't jump on every refresh. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const HOUR = 3_600_000;

/** 60 days of hourly closes, ending at the base price. */
export function mockPrices(symbol: TokenSymbol): PriceSeries {
  const base = BASE[symbol];
  const rand = rng(symbol.charCodeAt(0) * 97 + symbol.length);
  const now = Math.floor(Date.now() / HOUR) * HOUR;
  const n = 60 * 24;
  const out: PriceSeries = [];
  let p = base;
  // Walk backwards from now so the latest close is always the base price.
  for (let i = 0; i < n; i++) {
    out.push([now - i * HOUR, Number(p.toPrecision(6))]);
    const drift = Math.sin(i / 120) * 0.0006;
    p = p * (1 + (rand() - 0.5) * 0.012 + drift);
  }
  return out.reverse();
}

/** Raw events in the same shape Gemini's /v1/prediction-markets/events returns. */
export function mockEvents(symbol: string) {
  const base = BASE[symbol];
  if (!base) return [];
  const step = STEP[symbol];
  const now = new Date();

  const hourly = new Date(now); hourly.setUTCMinutes(0, 0, 0); hourly.setUTCHours(hourly.getUTCHours() + 1);
  const daily = new Date(now); daily.setUTCHours(21, 0, 0, 0); if (daily <= now) daily.setUTCDate(daily.getUTCDate() + 1);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 21));

  const stamp = (d: Date) => {
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  };
  const fmt = (v: number) => (v >= 100 ? `$${v.toLocaleString("en-US")}` : `$${v.toFixed(2)}`);

  return [
    { when: hourly, width: 4, vol: 0.004 },
    { when: daily, width: 8, vol: 0.02 },
    { when: monthEnd, width: 12, vol: 0.08 },
  ].map(({ when, width, vol }) => {
    const center = Math.round(base / step) * step;
    const contracts = [];
    for (let k = -width; k <= width; k++) {
      const strike = Number((center + k * step).toFixed(4));
      // Logistic curve: chance of finishing at or above the strike.
      const z = (strike - base) / (base * vol);
      const chance = Math.min(0.98, Math.max(0.02, 1 / (1 + Math.exp(1.7 * z))));
      const bid = Math.max(0.01, chance - 0.01), ask = Math.min(0.99, chance + 0.01);
      contracts.push({
        label: `${fmt(strike)} or above`,
        instrumentSymbol: `${symbol}${stamp(when)}-HI${strike}`,
        strike: { value: String(strike) },
        prices: {
          bestBid: bid.toFixed(2), bestAsk: ask.toFixed(2),
          buy: { yes: ask.toFixed(2), no: Math.min(0.99, 1 - bid).toFixed(2) },
        },
      });
    }
    return {
      ticker: `${symbol}${stamp(when)}`,
      title: `${symbol} price on ${when.toUTCString().slice(0, 22)} UTC (mock)`,
      expiryDate: when.toISOString(),
      contracts,
    };
  });
}
