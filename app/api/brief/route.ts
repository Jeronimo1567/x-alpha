import { getBrief } from "@/lib/brief";

/** The latest market brief Grok Bot saved, or null before the first run. */
export async function GET() {
  try {
    return Response.json({ brief: await getBrief() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load the brief" }, { status: 500 });
  }
}
