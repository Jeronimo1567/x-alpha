// Whether the QuickNode Streams are delivering: GET /api/streams/status
// Answers from the swaps that have arrived in the last day (simulated ones don't count), per covered token.
import { streamsStatus } from "@/lib/swaps";

export async function GET() {
  try {
    // Cached at Vercel's edge for 5 minutes: every open tab polls this, and they can all share one answer.
    return Response.json(await streamsStatus(), { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=120" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not read the swaps" }, { status: 500 });
  }
}
