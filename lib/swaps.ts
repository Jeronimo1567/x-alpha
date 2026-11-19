// Large swaps in the main tokens, as QuickNode Streams delivers them to /api/streams (filters in quicknode/).
// Locally they go to .data/swaps/<TOKEN>.jsonl, one swap per line. On Vercel (no writable disk) each delivery is one
// small Blob file under swaps/<TOKEN>/, so concurrent deliveries never overwrite each other. That is one Blob write per
// delivery, so set the Stream's batch size high when it points at a deployment.
import { promises as fs } from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";
import { TOKENS, type TokenSymbol } from "./stance";
import type { Chain } from "./onchain-sources";

export { ONCHAIN } from "./onchain-sources";

export type Swap = {
  sig: string; time: number; token: TokenSymbol; chain: Chain; wallet: string; side: "buy" | "sell";
  /** Tokens bought or sold. */
  amount: number;
  /** Dollar size, from the stablecoin side of the swap. */
  usd: number;
  /** True for swaps made up by the demo simulator, never for swaps from QuickNode. */
  sim?: boolean;
};

/** Swaps smaller than this are left out by the filters: the chart is about large wallets, not every trade. */
export const MIN_USD = 10_000;

const DIR = path.join(process.cwd(), ".data", "swaps");
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL);
const isToken = (t: unknown): t is TokenSymbol => (TOKENS as readonly unknown[]).includes(t);

/** Checks one record from a Stream. Returns null for anything that isn't a well-formed swap. */
export function cleanSwap(raw: unknown): Swap | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const side = r.side === "buy" || r.side === "sell" ? r.side : null;
  const chain = r.chain === "solana" || r.chain === "ethereum" ? r.chain : null;
  const amount = Number(r.amount), usd = Number(r.usd);
  // Block times come in seconds; accept milliseconds too.
  let time = Number(r.time);
  if (time > 0 && time < 1e12) time *= 1000;
  if (!side || !chain || !isToken(r.token) || typeof r.sig !== "string" || typeof r.wallet !== "string") return null;
  if (!(amount > 0) || !(usd > 0) || !(time > 0)) return null;
  return { sig: r.sig.slice(0, 100), time, token: r.token, chain, wallet: r.wallet.slice(0, 64), side, amount, usd, ...(r.sim ? { sim: true } : {}) };
}

/** Finds swap records anywhere in a Stream delivery: { swaps }, a list of those, or wrapped in { data }. */
export function swapsIn(body: unknown, depth = 0): unknown[] {
  if (depth > 3 || body === null || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.flatMap((b) => (b && typeof b === "object" && "side" in b ? [b] : swapsIn(b, depth + 1)));
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.swaps)) return o.swaps;
  return swapsIn(o.data ?? null, depth + 1);
}

export async function saveSwaps(swaps: Swap[]): Promise<number> {
  const byToken = new Map<TokenSymbol, Swap[]>();
  for (const s of swaps) byToken.set(s.token, [...(byToken.get(s.token) ?? []), s]);
  await Promise.all([...byToken].map(async ([token, batch]) => {
    if (useBlob()) {
      await put(`swaps/${token}/${batch[0].time}-${batch[0].sig.slice(0, 12)}.json`, JSON.stringify(batch), { access: "public", addRandomSuffix: true, contentType: "application/json" });
    } else {
      await fs.mkdir(DIR, { recursive: true });
      await fs.appendFile(path.join(DIR, `${token}.jsonl`), batch.map((s) => JSON.stringify(s)).join("\n") + "\n");
    }
  }));
  return swaps.length;
}

/** Swaps in one token between two times, oldest first, without duplicates. */
export async function loadSwaps(token: TokenSymbol, from: number, to: number): Promise<Swap[]> {
  let all: Swap[] = [];
  if (useBlob()) {
    let cursor: string | undefined;
    const urls: string[] = [];
    do {
      const page = await list({ prefix: `swaps/${token}/`, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const t = Number(b.pathname.split("/").pop()!.split("-")[0]);
        if (t >= from - 60_000 && t <= to + 60_000) urls.push(b.url);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const batches = await Promise.all(urls.map((u) => fetch(u, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => [])));
    all = batches.flat();
  } else {
    try {
      const text = await fs.readFile(path.join(DIR, `${token}.jsonl`), "utf8");
      for (const line of text.split("\n")) { if (line) try { all.push(JSON.parse(line)); } catch { /* torn line */ } }
    } catch { /* no swaps yet */ }
  }
  const seen = new Set<string>();
  return all
    .filter((s) => s.time >= from && s.time <= to)
    .filter((s) => { const k = `${s.sig}:${s.side}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.time - b.time);
}
