// What happened around a call: GET /api/impact?token=SOL&at=<ISO time of the post>&stance=bullish
// Price from Gemini candles, large-wallet flow from QuickNode Streams.
import { postImpact } from "@/lib/impact";
import { pricesAround } from "@/lib/prices";
import { loadSwaps, ONCHAIN } from "@/lib/swaps";
import { TOKENS, type TokenSymbol } from "@/lib/stance";

const HOUR = 3_600_000;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = String(q.get("token") ?? "").toUpperCase() as TokenSymbol;
  const postAt = Date.parse(q.get("at") ?? "");
  const stance = q.get("stance") === "bearish" ? "bearish" : "bullish";
  if (!(TOKENS as readonly string[]).includes(token)) return Response.json({ error: `token must be one of ${TOKENS.join(", ")}` }, { status: 400 });
  if (!ONCHAIN[token]) return Response.json({ error: `Onchain flow isn't tracked for ${token} yet.` }, { status: 404 });
  if (Number.isNaN(postAt)) return Response.json({ error: "at must be an ISO time" }, { status: 400 });
  try {
    const from = postAt - 12 * HOUR;
    const [swaps, candles] = await Promise.all([loadSwaps(token, from, postAt + 24 * HOUR), pricesAround(token, from)]);
    return Response.json(postImpact({ swaps, candles, postAt, stance }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load the data" }, { status: 500 });
  }
}
