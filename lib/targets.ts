// Price levels an account has named in its posts ("extremely bear sub 57k", "giga-bull at 82k+", "$62,500 breaks").
// Pure functions, used by the contract picker on the page and in the MCP server.
import type { Post } from "./sample";
import { TOKEN_NAMES, type TokenSymbol } from "./stance";
import { postTime } from "./track";

export type Target = {
  price: number;
  /** "down": a level the account expects price to fall to or below. "up": one it expects price to reach or clear. */
  dir: "up" | "down";
  /** True when a word in the post said which way ("sub", "above", "82k+"), not just which side of today's price it is on. */
  explicit: boolean;
  /** The words around the number, for showing where it came from. */
  quote: string;
  postId: string;
  url?: string;
  postedAt: number;
  /** Recency × post strength × how explicit the level was. */
  weight: number;
};

const HALF_LIFE_DAYS = 3;
const DAY = 86_400_000;
// "target" and "tp" are left out on purpose: a bear's "target 55k" points down, so those take their side of today's price.
// A number counts as a price only with a $, a k, or thousands commas: "57k", "$75", "62,500". Never a bare "6" or "2022".
const NUMBER = /(\$)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b|K\b)?(\+)?(%)?/g;
const DOWN = /\b(sub|below|under|beneath|lose|loses|losing|lost|break(?:s|ing)? down|breakdown|retest(?:s|ing)?|down to|drop(?:s|ping)? to|fall(?:s|ing)? to|dump(?:s|ing)? to|short(?:ing)?|puts?)\s*(?:the\s*)?\$?$/i;
const UP = /\b(above|over|reclaim(?:s|ing)?|break(?:s|ing)? (?:out|above)|breakout|up to|rall(?:y|ies) to|pump(?:s|ing)? to|run(?:s|ning)? to|calls?|ath)\s*(?:the\s*)?\$?$/i;

/** True when the post is about this token, by label or by name ("$BTC", "bitcoin"). */
function about(p: Post, symbol: TokenSymbol) {
  if (p.token === symbol) return true;
  const t = p.text.toLowerCase();
  return t.includes(`$${symbol.toLowerCase()}`) || t.includes(TOKEN_NAMES[symbol].toLowerCase());
}

/**
 * Price levels for `symbol` named in `posts`. `ref` is today's price: numbers outside 0.4×–2.5× of it are not prices
 * of this token (counts, years, other coins), and a level with no direction word takes its side of `ref` as its direction.
 */
export function extractTargets(posts: Post[], symbol: TokenSymbol, ref: number, now = Date.now()): Target[] {
  const out: Target[] = [];
  for (const p of posts) {
    if (!about(p, symbol)) continue;
    const at = postTime(p, now);
    const recency = Math.pow(0.5, Math.max(0, now - at) / DAY / HALF_LIFE_DAYS);
    for (const m of p.text.matchAll(NUMBER)) {
      const [whole, dollar, digits, k, plus, percent] = m;
      if (percent || (!dollar && !k && !digits.includes(","))) continue;
      const price = Number(digits.replace(/,/g, "")) * (k ? 1000 : 1);
      if (!(price > ref * 0.4 && price < ref * 2.5)) continue;
      const before = p.text.slice(Math.max(0, m.index! - 28), m.index!);
      const said: "up" | "down" | null = plus ? "up" : DOWN.test(before) ? "down" : UP.test(before) ? "up" : null;
      const dir = said ?? (price < ref ? "down" : "up");
      const start = Math.max(0, m.index! - 32), end = Math.min(p.text.length, m.index! + whole.length + 12);
      out.push({
        price, dir, explicit: said !== null, postId: p.id, url: p.url, postedAt: at,
        quote: (start > 0 ? "…" : "") + p.text.slice(start, end).trim() + (end < p.text.length ? "…" : ""),
        weight: recency * Math.max(0.3, p.strength || 0.5) * (said ? 1 : 0.6),
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}
