// Live odds from Gemini's public prediction markets API. No key needed for market data.

export type Rung = { strike: number; label: string; chance: number | null; yesAsk: number | null; noAsk: number | null; instrument: string };
export type Ladder = { ticker: string; title: string; expiry: string; rungs: Rung[]; expectedPrice: number | null };

type RawContract = {
  label: string; instrumentSymbol: string; strike?: { value: string };
  prices?: { bestBid?: string; bestAsk?: string; buy?: { yes?: string; no?: string } };
};
type RawEvent = { ticker: string; title: string; expiryDate: string; contracts: RawContract[] };

import { geminiMock, mockEvents } from "./gemini-mock";

const num = (s?: string) => (s === undefined ? null : Number(s));

/** Price where the market sees a 50% chance of finishing above. */
function expectedPrice(rungs: Rung[]): number | null {
  const known = rungs.filter((r) => r.chance !== null) as (Rung & { chance: number })[];
  for (let i = 0; i < known.length - 1; i++) {
    const a = known[i], b = known[i + 1];
    if (a.chance >= 0.5 && b.chance < 0.5) {
      return a.strike + ((a.chance - 0.5) / (a.chance - b.chance)) * (b.strike - a.strike);
    }
  }
  return null;
}

export async function ladders(symbol: string): Promise<Ladder[]> {
  const events: RawEvent[] = geminiMock ? mockEvents(symbol) : await fetchEvents(symbol);
  return shape(symbol, events);
}

async function fetchEvents(symbol: string): Promise<RawEvent[]> {
  const url = `https://api.gemini.com/v1/prediction-markets/events?status=active&category=Crypto&limit=100&search=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
  return (await res.json()).data ?? [];
}

function shape(symbol: string, events: RawEvent[]): Ladder[] {
  // Keep the hourly, daily and month-end ladders. Skip the 5 and 15 minute ones.
  const plain = new RegExp(`^${symbol}\\d{10}$`);
  return events
    .filter((e) => plain.test(e.ticker))
    .map((e) => {
      const rungs = e.contracts
        .filter((c) => c.strike)
        .map((c) => {
          const bid = num(c.prices?.bestBid), ask = num(c.prices?.bestAsk);
          return {
            strike: Number(c.strike!.value), label: c.label, instrument: c.instrumentSymbol,
            // Midpoint of bid and ask is the market's chance the price finishes at or above the strike.
            chance: bid !== null && ask !== null ? (bid + ask) / 2 : null,
            yesAsk: num(c.prices?.buy?.yes), noAsk: num(c.prices?.buy?.no),
          };
        })
        .sort((a, b) => a.strike - b.strike);
      return { ticker: e.ticker, title: e.title, expiry: e.expiryDate, rungs, expectedPrice: expectedPrice(rungs) };
    })
    .filter((l) => l.rungs.length > 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

export type Match = { side: "yes" | "no"; rung: Rung; price: number; chance: number | null };

/** The contract just beyond the market's expected price, on the side the lean points to. */
export function matchContract(ladder: Ladder, lean: "bullish" | "bearish"): Match | null {
  const exp = ladder.expectedPrice;
  if (exp === null) return null;
  if (lean === "bullish") {
    const rung = ladder.rungs.find((r) => r.strike > exp && r.yesAsk !== null);
    return rung ? { side: "yes", rung, price: rung.yesAsk!, chance: rung.chance } : null;
  }
  const rung = [...ladder.rungs].reverse().find((r) => r.strike < exp && r.noAsk !== null);
  return rung ? { side: "no", rung, price: rung.noAsk!, chance: rung.chance === null ? null : 1 - rung.chance } : null;
}
