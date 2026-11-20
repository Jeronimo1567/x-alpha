// Shared storage on Vercel: Upstash Redis, connected through the Vercel Marketplace (it sets KV_REST_API_URL and
// KV_REST_API_TOKEN; UPSTASH_REDIS_REST_URL / _TOKEN work too). Without those, the app keeps everything in .data/ on
// disk, which is enough for local development.
//
// Why Redis and not Vercel Blob: Blob bills per operation, and the Hobby plan allows about 10,000 reads and 2,000
// writes or lists a month. One file per QuickNode delivery, plus listing every file on each status check, used that
// up in a few hours and the store was blocked. Here a delivery is one ZADD, and a status check is one pipelined
// request, well inside Upstash's free 500,000 commands a month.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/** The Redis client, or null when no database is connected (local development). Values are stored as JSON text. */
export const kv: Redis | null = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

/** Keys, in one place. */
export const KEYS = {
  readings: "xalpha:readings",          // hash: handle → reading JSON
  brief: "xalpha:brief",                // string: brief JSON
  swaps: (token: string) => `xalpha:swaps:${token}`, // sorted set: score = time (ms), member = swap JSON
  swapsLast: "xalpha:swaps:last",       // hash: token → time (ms) of the newest real swap
};

export const parse = <T>(raw: unknown): T => (typeof raw === "string" ? JSON.parse(raw) : raw) as T;

/** HGETALL answers with a flat [field, value, field, value, …] list when values aren't auto-parsed; this makes it an object. */
export function hashObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw as Record<string, string>;
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
  return out;
}
