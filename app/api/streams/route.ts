// Webhook destination for the QuickNode Streams (filters: quicknode/solana-filter.js, quicknode/ethereum-filter.js).
// Each delivery carries the large swaps in the main tokens from one or more blocks.
//
// With QUICKNODE_STREAM_TOKEN set (the Stream's security token), every delivery must carry a valid signature:
// x-qn-signature = hex HMAC-SHA256 over nonce + timestamp + body, keyed with the token. Without it (local dev) the
// webhook is open.
import { createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { cleanSwap, saveSwaps, swapsIn, type Swap } from "@/lib/swaps";

/** Deliveries older than this are refused, so a captured one can't be replayed later. */
const MAX_AGE_S = 600;

function verified(request: Request, body: string): boolean {
  // One security token per Stream (Solana and Ethereum), comma-separated.
  const tokens = (process.env.QUICKNODE_STREAM_TOKEN ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return true;
  const nonce = request.headers.get("x-qn-nonce"), ts = request.headers.get("x-qn-timestamp"), sig = request.headers.get("x-qn-signature");
  if (!nonce || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_S) return false;
  const given = Buffer.from(sig.toLowerCase());
  return tokens.some((token) => {
    const expected = Buffer.from(createHmac("sha256", token).update(nonce + ts + body).digest("hex"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  // QuickNode can gzip deliveries; the signature covers the uncompressed JSON.
  let body: string;
  try {
    body = request.headers.get("content-encoding")?.includes("gzip") || (raw[0] === 0x1f && raw[1] === 0x8b) ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  } catch {
    return Response.json({ error: "Could not decompress the body" }, { status: 400 });
  }
  if (!verified(request, body)) return Response.json({ error: "Bad or missing QuickNode signature" }, { status: 401 });

  let parsed: unknown;
  try { parsed = body ? JSON.parse(body) : null; } catch { return Response.json({ error: "Body is not JSON" }, { status: 400 }); }
  // A test delivery from the QuickNode dashboard has no swaps; answer 200 so the destination check passes.
  const swaps = swapsIn(parsed).map(cleanSwap).filter((s): s is Swap => s !== null && !s.sim);
  if (swaps.length) await saveSwaps(swaps);
  return Response.json({ received: swaps.length });
}
