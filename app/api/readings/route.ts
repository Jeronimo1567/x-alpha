import { listReadings, toAccount } from "@/lib/readings";

export async function GET() {
  try {
    return Response.json({ accounts: (await listReadings()).map((r) => toAccount(r)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load readings" }, { status: 500 });
  }
}
