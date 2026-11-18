// The market brief Grok Bot sends in as part of its routine: how crypto looks overall, what the loudest voices on X
// are saying, and the big news. One document, replaced on every run. Stored like readings: Vercel Blob on Vercel,
// .data/brief.json locally.
import { promises as fs } from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";
import { cleanAvatar, cleanHandle } from "./readings";
import { TOKENS, type TokenSymbol } from "./stance";

export type Mood = "bullish" | "bearish" | "mixed";
export type BriefCoin = { symbol: TokenSymbol; mood: Mood; note: string };
export type BriefVoice = { handle: string; name: string; avatar?: string; take: string; mood: Mood; url?: string; followers?: string };
export type BriefNews = { title: string; summary: string; url?: string; source?: string; at?: string; impact: Mood; tokens: TokenSymbol[] };
export type SuggestedAccount = { handle: string; name: string; avatar?: string; followers?: string; why: string; tokens: TokenSymbol[] };
export type MarketBrief = {
  savedAt: string; mood: Mood; headline: string; summary: string;
  coins: BriefCoin[]; voices: BriefVoice[]; news: BriefNews[];
  /** Accounts Grok Bot thinks are worth adding. Older briefs may not have it. */
  suggested?: SuggestedAccount[];
};

const LOCAL_FILE = path.join(process.cwd(), ".data", "brief.json");
const BLOB_PATH = "brief/latest.json";
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const text = (v: unknown, max: number, field: string, required = true) => {
  const s = String(v ?? "").trim().slice(0, max);
  if (required && !s) throw new Error(`${field} is empty`);
  return s;
};
const mood = (v: unknown, field: string): Mood => {
  if (v === "bullish" || v === "bearish" || v === "mixed") return v;
  throw new Error(`${field} must be bullish, bearish or mixed`);
};
const token = (v: unknown, field: string): TokenSymbol => {
  const t = String(v ?? "").toUpperCase();
  if (!(TOKENS as readonly string[]).includes(t)) throw new Error(`${field} must be one of ${TOKENS.join(", ")}`);
  return t as TokenSymbol;
};
const tokens = (v: unknown): TokenSymbol[] =>
  Array.isArray(v) ? [...new Set(v.map((t) => String(t).toUpperCase()).filter((t) => (TOKENS as readonly string[]).includes(t)))] as TokenSymbol[] : [];
const link = (v: unknown) => (typeof v === "string" && /^https:\/\/\S+$/.test(v) ? v.slice(0, 500) : undefined);
const list_ = (v: unknown, field: string, max: number) => {
  if (!Array.isArray(v)) throw new Error(`${field} must be a list`);
  return v.slice(0, max);
};

/** Checks and tidies what the agent sent. Throws with a message the agent can act on. */
export function cleanBrief(raw: Record<string, unknown>): MarketBrief {
  return {
    savedAt: new Date().toISOString(),
    mood: mood(raw.mood, "mood"),
    headline: text(raw.headline, 140, "headline"),
    summary: text(raw.summary, 900, "summary"),
    coins: list_(raw.coins ?? [], "coins", TOKENS.length).map((c, i) => ({
      symbol: token(c?.symbol, `coins[${i}].symbol`), mood: mood(c?.mood, `coins[${i}].mood`), note: text(c?.note, 220, `coins[${i}].note`),
    })),
    voices: list_(raw.voices ?? [], "voices", 8).map((v, i) => ({
      handle: "@" + cleanHandle(v?.handle), name: text(v?.name, 80, `voices[${i}].name`, false) || "@" + cleanHandle(v?.handle),
      avatar: cleanAvatar(v?.profile_image_url), take: text(v?.take, 280, `voices[${i}].take`), mood: mood(v?.mood, `voices[${i}].mood`),
      url: link(v?.url), followers: text(v?.followers, 20, "", false) || undefined,
    })),
    news: list_(raw.news ?? [], "news", 8).map((n, i) => ({
      title: text(n?.title, 160, `news[${i}].title`), summary: text(n?.summary, 400, `news[${i}].summary`),
      url: link(n?.url), source: text(n?.source, 60, "", false) || undefined,
      at: n?.at && !Number.isNaN(Date.parse(String(n.at))) ? new Date(String(n.at)).toISOString() : undefined,
      impact: mood(n?.impact, `news[${i}].impact`),
      tokens: tokens(n?.tokens),
    })),
    suggested: list_(raw.suggested_accounts ?? [], "suggested_accounts", 6).map((a, i) => ({
      handle: "@" + cleanHandle(a?.handle), name: text(a?.name, 80, "", false) || "@" + cleanHandle(a?.handle),
      avatar: cleanAvatar(a?.profile_image_url), followers: text(a?.followers, 20, "", false) || undefined,
      why: text(a?.why, 240, `suggested_accounts[${i}].why`), tokens: tokens(a?.tokens),
    })),
  };
}

export async function getBrief(): Promise<MarketBrief | null> {
  if (useBlob()) {
    const { blobs } = await list({ prefix: BLOB_PATH });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    return r.ok ? r.json() : null;
  }
  try { return JSON.parse(await fs.readFile(LOCAL_FILE, "utf8")); } catch { return null; }
}

export async function saveBrief(brief: MarketBrief): Promise<MarketBrief> {
  if (useBlob()) {
    await put(BLOB_PATH, JSON.stringify(brief), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  } else {
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await fs.writeFile(LOCAL_FILE, JSON.stringify(brief, null, 2));
  }
  return brief;
}
