import { ladders } from "@/lib/gemini";
import { TOKENS } from "@/lib/stance";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!(TOKENS as readonly string[]).includes(symbol)) {
    return Response.json({ error: "Unknown token" }, { status: 400 });
  }
  try {
    return Response.json({ ladders: await ladders(symbol) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not reach Gemini" }, { status: 502 });
  }
}
