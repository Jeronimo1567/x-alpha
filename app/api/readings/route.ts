import { cleanHandle, deleteReading, listReadings, toAccount } from "@/lib/readings";

export async function GET() {
  try {
    return Response.json({ accounts: (await listReadings()).map((r) => toAccount(r)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load readings" }, { status: 500 });
  }
}

/** Removes an account's saved reading: DELETE /api/readings?handle=example. Open on purpose (hackathon); add a key check before real use. */
export async function DELETE(request: Request) {
  try {
    const handle = cleanHandle(new URL(request.url).searchParams.get("handle"));
    return Response.json({ deleted: await deleteReading(handle) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not delete" }, { status: 400 });
  }
}
