import { allPrices } from "@/lib/prices";

// Reads the request so the route always runs per request; prices are cached in lib/prices.
export async function GET(request: Request) {
  void request.url;
  const prices = await allPrices();
  if (Object.keys(prices).length === 0) return Response.json({ error: "Could not load Gemini price history" }, { status: 502 });
  return Response.json({ prices });
}
