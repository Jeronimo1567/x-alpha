// Adds made-up large swaps for a main token, for rehearsing the onchain chart. They are marked simulated end to end.
// Off in production unless X_ALPHA_ALLOW_SIM=1.
import { pricesAround } from "@/lib/prices";
import { loadSwaps, ONCHAIN, saveSwaps } from "@/lib/swaps";
import { simulateSwaps } from "@/lib/simulate";
import type { TokenSymbol } from "@/lib/stance";

const DAY = 86_400_000;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.X_ALPHA_ALLOW_SIM !== "1") {
    return Response.json({ error: "The simulator is off in production." }, { status: 403 });
  }
  const { token } = (await request.json().catch(() => ({}))) as { token?: TokenSymbol };
  if (!token || !ONCHAIN[token]) return Response.json({ error: "token must be one the Streams cover: " + Object.keys(ONCHAIN).join(", ") }, { status: 400 });

  const now = Date.now(), from = now - 15 * DAY;
  // Only add minutes after the last simulated swap, so repeated calls don't pile up copies.
  const last = (await loadSwaps(token, from, now)).filter((s) => s.sim).at(-1)?.time ?? from - 1;
  const candles = await pricesAround(token, from).catch(() => []);
  const price = (t: number) => { let p: number | null = null; for (const [ct, c] of candles) { if (ct > t) break; p = c; } return p; };
  const swaps = simulateSwaps(token, last + 1, now, price);
  if (swaps.length) await saveSwaps(swaps);
  return Response.json({ added: swaps.length, simulated: true });
}
