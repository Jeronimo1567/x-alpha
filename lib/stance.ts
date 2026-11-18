import type { Account, Post } from "./sample";

export const TOKENS = ["BTC", "ETH", "SOL", "XRP"] as const;
export type TokenSymbol = (typeof TOKENS)[number];
export const TOKEN_NAMES: Record<TokenSymbol, string> = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP" };

/** A post counts half as much every 3 days. */
const HALF_LIFE_DAYS = 3;
const weight = (p: Post) => p.strength * Math.pow(0.5, p.daysAgo / HALF_LIFE_DAYS);
const direction = (p: Post) => (p.stance === "bullish" ? 1 : p.stance === "bearish" ? -1 : 0);

/** 0 = fully bearish, 50 = neutral, 100 = fully bullish. Null if there are no posts. */
function score(posts: Post[]): number | null {
  const total = posts.reduce((s, p) => s + weight(p), 0);
  if (total === 0) return null;
  return 50 + 50 * (posts.reduce((s, p) => s + weight(p) * direction(p), 0) / total);
}

export type TokenStance = { symbol: TokenSymbol; score: number | null; posts: number; lastWeek: number | null };

/** Per-token stance this week, plus what the same calculation gave a week ago. */
export function stances(account: Account): TokenStance[] {
  return TOKENS.map((symbol) => {
    const about = account.posts.filter((p) => p.token === symbol);
    const thisWeek = about.filter((p) => p.daysAgo < 7);
    const before = about.filter((p) => p.daysAgo >= 7).map((p) => ({ ...p, daysAgo: p.daysAgo - 7 }));
    return { symbol, score: score(thisWeek), posts: thisWeek.length, lastWeek: score(before) };
  });
}

export const lean = (s: number | null) =>
  s === null ? "No posts" : s >= 60 ? "Bullish" : s <= 40 ? "Bearish" : "Neutral";
