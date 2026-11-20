// Readings that Grok Bot sends in through the MCP server: one JSON document per X account.
// On Vercel they live in Upstash Redis, one hash field per account (lib/kv). Locally they live in .data/readings.json.
import { promises as fs } from "node:fs";
import path from "node:path";
import { hashObject, kv, KEYS, parse } from "./kv";
import type { Account, Stance } from "./sample";
import { TOKENS, type TokenSymbol } from "./stance";

export type SavedPost = { text: string; url?: string; postedAt: string; token: TokenSymbol | null; stance: Stance; strength: number };
export type Reading = { handle: string; name: string; summary: string; analyzedAt: string; posts: SavedPost[]; avatar?: string };

const KEEP_DAYS = 30;
const MAX_POSTS = 100;
const DAY = 86_400_000;
const LOCAL_FILE = path.join(process.cwd(), ".data", "readings.json");

/** Accepts only X's own image host, and asks for the larger size. */
export function cleanAvatar(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !/^https:\/\/pbs\.twimg\.com\/[\w\-./%]+$/.test(raw)) return undefined;
  return raw.replace(/_(normal|bigger|mini)(\.\w+)$/, "_400x400$2");
}

export function cleanHandle(raw: unknown): string {
  const h = String(raw ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(h)) throw new Error("handle must be an X username, like @example");
  return h;
}

/** Checks and tidies what the agent sent. Throws with a message the agent can act on. */
export function cleanPosts(raw: unknown): SavedPost[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("posts must be a non-empty list");
  if (raw.length > MAX_POSTS) throw new Error(`send at most ${MAX_POSTS} posts`);
  return raw.map((p, i) => {
    const at = new Date(String(p?.posted_at ?? ""));
    if (Number.isNaN(at.getTime())) throw new Error(`posts[${i}].posted_at must be an ISO date`);
    const stance = p?.stance;
    if (stance !== "bullish" && stance !== "bearish" && stance !== "neutral") throw new Error(`posts[${i}].stance must be bullish, bearish or neutral`);
    const token = p?.token == null ? null : String(p.token).toUpperCase();
    if (token !== null && !(TOKENS as readonly string[]).includes(token)) throw new Error(`posts[${i}].token must be one of ${TOKENS.join(", ")} or null`);
    const text = String(p?.text ?? "").trim().slice(0, 600);
    if (!text) throw new Error(`posts[${i}].text is empty`);
    const url = typeof p?.url === "string" && /^https:\/\/(x|twitter)\.com\//.test(p.url) ? p.url : undefined;
    const strength = Math.max(0, Math.min(1, Number(p?.strength ?? 0.5) || 0));
    return { text, url, postedAt: at.toISOString(), token: token as TokenSymbol | null, stance, strength };
  });
}

async function readLocal(): Promise<Record<string, Reading>> {
  try { return JSON.parse(await fs.readFile(LOCAL_FILE, "utf8")); } catch { return {}; }
}

export async function listReadings(): Promise<Reading[]> {
  let all: Reading[];
  if (kv) {
    // One command for every account.
    const rows = hashObject(await kv.hgetall(KEYS.readings));
    all = Object.values(rows).map((r) => parse<Reading>(r));
  } else {
    all = Object.values(await readLocal());
  }
  return all.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

export async function getReading(handle: string): Promise<Reading | null> {
  if (kv) { const r = await kv.hget<string>(KEYS.readings, handle); return r ? parse<Reading>(r) : null; }
  return (await listReadings()).find((r) => r.handle === handle) ?? null;
}

/** Saves a reading. Posts from earlier runs are kept for 30 days so week-over-week change works. */
export async function saveReading(input: { handle: string; name: string; summary: string; posts: SavedPost[]; avatar?: string }): Promise<Reading> {
  const before = await getReading(input.handle);
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  const byKey = new Map<string, SavedPost>();
  for (const p of [...(before?.posts ?? []), ...input.posts]) byKey.set(p.url ?? p.text, p); // newer label wins
  const posts = [...byKey.values()].filter((p) => Date.parse(p.postedAt) >= cutoff).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const reading: Reading = { handle: input.handle, name: input.name, summary: input.summary, analyzedAt: new Date().toISOString(), posts, avatar: input.avatar ?? before?.avatar };

  if (kv) {
    await kv.hset(KEYS.readings, { [input.handle]: JSON.stringify(reading) });
  } else {
    const all = await readLocal();
    all[input.handle] = reading;
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await fs.writeFile(LOCAL_FILE, JSON.stringify(all, null, 2));
  }
  return reading;
}

/** Deletes an account's saved reading. Returns false if there was none. */
export async function deleteReading(handle: string): Promise<boolean> {
  if (kv) return (await kv.hdel(KEYS.readings, handle)) > 0;
  const all = await readLocal();
  if (!all[handle]) return false;
  delete all[handle];
  await fs.writeFile(LOCAL_FILE, JSON.stringify(all, null, 2));
  return true;
}

/** Shapes a saved reading like the accounts the dashboard and scoring already use. */
export function toAccount(r: Reading, now = Date.now()): Account {
  return {
    handle: "@" + r.handle, name: r.name, bio: r.summary, followers: "", source: "grok", analyzedAt: r.analyzedAt, avatar: r.avatar,
    posts: r.posts.map((p, i) => ({
      id: `${r.handle}-${i}`, postedAt: p.postedAt, text: p.text, url: p.url, token: p.token, stance: p.stance, strength: p.strength,
      daysAgo: Math.max(0, Math.floor((now - Date.parse(p.postedAt)) / DAY)),
    })),
  };
}
