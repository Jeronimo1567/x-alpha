// Large swaps in the main tokens, as QuickNode Streams delivers them to /api/streams (filters in quicknode/).
// On Vercel they live in Upstash Redis (lib/kv): one sorted set per token, scored by time, so a delivery is one ZADD
// and a call's window is one ZRANGE. Swaps older than KEEP_DAYS are trimmed as new ones arrive.
// Locally (no Redis) they go to .data/swaps/<TOKEN>.jsonl, one swap per line.
import { promises as fs } from "node:fs";
import path from "node:path";
import { hashObject, kv, KEYS, parse } from "./kv";
import { TOKENS, type TokenSymbol } from "./stance";
import { ONCHAIN, ONCHAIN_SOURCES, type Chain } from "./onchain-sources";

export { ONCHAIN };

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
/** How long swaps are kept. The onchain view looks at most 12h before and 24h after a call from the last ~2 weeks. */
const KEEP_DAYS = 14;
const DAY = 86_400_000;
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
  if (kv) {
    // One request: per token, add the batch (identical swaps collapse, members are unique) and trim old ones; then
    // note the newest real swap per token for the status check.
    const p = kv.pipeline();
    const last: Record<string, number> = {};
    for (const [token, batch] of byToken) {
      const [first, ...rest] = batch.map((s) => ({ score: s.time, member: JSON.stringify(s) }));
      p.zadd(KEYS.swaps(token), first, ...rest);
      p.zremrangebyscore(KEYS.swaps(token), 0, Date.now() - KEEP_DAYS * DAY);
      const real = batch.filter((s) => !s.sim);
      if (real.length) last[token] = Math.max(...real.map((s) => s.time));
    }
    if (Object.keys(last).length) {
      // Only move "last" forward (a delayed delivery must not move it back).
      const prev = hashObject(await kv.hgetall(KEYS.swapsLast));
      const next = Object.fromEntries(Object.entries(last).filter(([t, v]) => v > Number(prev[t] ?? 0)));
      if (Object.keys(next).length) p.hset(KEYS.swapsLast, next);
    }
    await p.exec();
    return swaps.length;
  }
  await Promise.all([...byToken].map(async ([token, batch]) => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.appendFile(path.join(DIR, `${token}.jsonl`), batch.map((s) => JSON.stringify(s)).join("\n") + "\n");
  }));
  return swaps.length;
}

/** Swaps in one token between two times, oldest first, without duplicates. */
export async function loadSwaps(token: TokenSymbol, from: number, to: number): Promise<Swap[]> {
  let all: Swap[] = [];
  if (kv) {
    // One command for the whole window.
    all = (await kv.zrange<string[]>(KEYS.swaps(token), from, to, { byScore: true })).map((m) => parse<Swap>(m));
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

export type StreamsStatus = {
  /** Newest real swap from QuickNode in each covered token over the last day, and how many arrived. */
  tokens: { token: TokenSymbol; chain: Chain; last: number | null; count: number }[];
  /** Newest real swap in any token. */
  last: number | null;
  checkedAt: number;
};

/** How the Streams are doing, from what has arrived: simulated swaps don't count. */
export async function streamsStatus(now = Date.now()): Promise<StreamsStatus> {
  const from = now - DAY;
  const covered = Object.keys(ONCHAIN_SOURCES) as TokenSymbol[];
  let tokens: StreamsStatus["tokens"];
  if (kv) {
    // One request, a handful of commands: the newest real swap per token, and how many swaps arrived in the last day.
    // (The count includes simulated swaps, which only exist when the simulator was used on this database.)
    const p = kv.pipeline();
    p.hgetall(KEYS.swapsLast);
    for (const t of covered) p.zcount(KEYS.swaps(t), from, now);
    const [lastRaw, ...counts] = await p.exec<[unknown, ...number[]]>();
    const last = hashObject(lastRaw);
    tokens = covered.map((token, i) => {
      const t = Number(last[token] ?? 0);
      return { token, chain: ONCHAIN[token]!.chain, last: t || null, count: Number(counts[i] ?? 0) };
    });
  } else {
    tokens = await Promise.all(covered.map(async (token) => {
      const real = (await loadSwaps(token, from, now)).filter((s) => !s.sim);
      return { token, chain: ONCHAIN[token]!.chain, last: real.at(-1)?.time ?? null, count: real.length };
    }));
  }
  const last = tokens.reduce<number | null>((m, t) => (t.last !== null && (m === null || t.last > m) ? t.last : m), null);
  return { tokens, last, checkedAt: now };
}
