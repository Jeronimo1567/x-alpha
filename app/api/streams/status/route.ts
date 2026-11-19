// Whether the QuickNode Streams are delivering: GET /api/streams/status
// Answers from the swaps that have arrived in the last day (simulated ones don't count), per covered token.
import { streamsStatus } from "@/lib/swaps";

export async function GET() {
  try {
    return Response.json(await streamsStatus(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not read the swaps" }, { status: 500 });
  }
}
