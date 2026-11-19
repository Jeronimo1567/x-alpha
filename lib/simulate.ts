// Made-up large swaps for rehearsing the onchain chart before a real Stream has data. Every swap is marked sim: true
// and the page labels the chart "Simulated", so this can never pass for QuickNode data.
//
// Swaps don't depend on any post: each minute's swaps come from a seed made of the token and the minute, with slow
// waves of net buying and selling, so every account's calls on a token see the same made-up market and calling it
// again re-creates the same swaps (deduplicated on load) and only adds new minutes.
import type { Swap } from "./swaps";
import { ONCHAIN } from "./swaps";
import type { TokenSymbol } from "./stance";

const MIN = 60_000;
const HEX = "0123456789abcdef";

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const wallet = (seed: string) => { const r = rng(seed); let s = "0x"; for (let i = 0; i < 40; i++) s += HEX[Math.floor(r() * 16)]; return s; };

export function simulateSwaps(token: TokenSymbol, from: number, until: number, price: (t: number) => number | null): Swap[] {
  const chain = ONCHAIN[token]?.chain;
  if (!chain) return [];
  const whales = Array.from({ length: 40 }, (_, i) => wallet(`${token}-whale-${i}`));
  const out: Swap[] = [];
  for (let m = Math.floor(from / MIN) * MIN; m <= until; m += MIN) {
    const r = rng(`${token}-${m}`);
    const hours = m / 3_600_000;
    // Net buying leans with two slow waves (about 9 and 31 hours), so there are stretches of each side.
    const lean = 0.55 * Math.sin(hours / 1.4) + 0.35 * Math.sin(hours / 4.9 + 1);
    const n = r() < 0.22 ? 1 + Math.floor(r() * 2) : 0;
    for (let i = 0; i < n; i++) {
      const buy = r() < 0.5 + lean * 0.35;
      const usd = 10_000 + Math.pow(r(), 3) * 900_000;
      const p = price(m) ?? 1;
      out.push({ sig: `sim-${token}-${m}-${i}`, time: m + Math.floor(r() * MIN), token, chain, wallet: whales[Math.floor(r() * whales.length)], side: buy ? "buy" : "sell", amount: usd / p, usd, sim: true });
    }
  }
  return out.filter((s) => s.time >= from && s.time <= until);
}
