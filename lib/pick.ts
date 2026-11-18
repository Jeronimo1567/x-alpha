// Which Gemini contract best expresses an account's view, and why.
//
// 1. Target: where the account thinks price is going, from levels it named in its posts (lib/targets),
//    or, with none, its typical move from its track record.
// 2. The account's odds: the market's odds curve shifted toward that target, by how strongly the account leans and
//    by how much time is left before the contract settles (a call is judged over HORIZON_DAYS; a contract settling
//    in a few hours only gets a small part of that move).
// 3. Credibility: those odds blended with the market's, weighted by how often the account has been right on this token.
// 4. Each contract on the lean's side is scored by Kelly growth (the long-run growth rate from betting the Kelly
//    fraction at those odds). Kelly weighs edge against the chance of winning, so it doesn't just chase long shots.
//    Contracts the account or the market gives less than MIN_CHANCE are skipped as long shots.
//    No contract with a positive edge means no pick.
import type { Ladder, Match, Rung } from "./gemini";
import type { Post } from "./sample";
import type { TokenSymbol } from "./stance";
import { extractTargets, type Target } from "./targets";
import { HORIZON_DAYS, type Tally } from "./track";

export type Candidate = Match & {
  /** Chance the contract pays, by the account's view (after credibility). */
  accountChance: number;
  /** Chance it pays, by the market (midpoint of bid and ask). */
  marketChance: number;
  /** accountChance minus the price paid: expected profit per $1 contract. */
  edge: number;
  /** Expected log growth per bet at the Kelly fraction. Higher is better. */
  growth: number;
  /** Kelly fraction of a bankroll, for reference only. */
  kelly: number;
};

export type Pick = Candidate & {
  /** Where the account's view centres the price at settle. */
  accountPrice: number;
  marketPrice: number;
  /** The level that carried the most weight in the account's target, if any. */
  target: Target | null;
  /** Every named level on the lean's side that went into the target, heaviest first, with its share of the weight. */
  used: (Target & { share: number })[];
  /** 0 to 1, from how far the lean score is from 50. */
  conviction: number;
  /** 0 to 1, how much the account's view counts against the market's. */
  credibility: number;
  /** All contracts with a positive edge, best first. */
  candidates: Candidate[];
};

export type PickResult = { pick: Pick | null; reason?: string; targets: Target[] };

/** Smallest win chance worth showing; below this a pick is a lottery ticket whatever its edge. */
const MIN_CHANCE = 0.12;
const DAY = 86_400_000;
/** Credibility for an account with no judged calls: it moves the odds a little, never a lot. */
const PRIOR_CREDIBILITY = 0.3;

/**
 * How much an account's view counts against the market's, 0 to 1, from its judged calls on this token.
 * Half right counts 0, all right counts 1, and with few calls it is pulled toward PRIOR_CREDIBILITY:
 * 16/16 right → 0.92, no judged calls → 0.30, 1/1 → 0.53, 0/1 → 0.
 */
export function credibilityOf(record: Tally | null): number {
  const settled = record?.settled ?? 0, right = record?.right ?? 0;
  const prior = 2;
  const fromRecord = (settled ? (right / settled) * 2 - 1 : 0) * (settled / (settled + prior));
  return Math.max(0, Math.min(1, fromRecord + PRIOR_CREDIBILITY * (prior / (settled + prior))));
}

/** Market chance of finishing at or above `strike`, straight between known rungs and flat beyond the ends. */
function chanceAt(rungs: (Rung & { chance: number })[], strike: number): number {
  if (strike <= rungs[0].strike) return rungs[0].chance;
  const last = rungs[rungs.length - 1];
  if (strike >= last.strike) return last.chance;
  const i = rungs.findIndex((r) => r.strike >= strike);
  const a = rungs[i - 1], b = rungs[i];
  return a.chance + ((strike - a.strike) / (b.strike - a.strike)) * (b.chance - a.chance);
}

export function bestContract(input: {
  ladder: Ladder; symbol: TokenSymbol; score: number | null; posts: Post[];
  record: Tally | null; ref: number | null; now?: number;
}): PickResult {
  const { ladder, symbol, score, posts, record, ref } = input;
  const now = input.now ?? Date.now();
  const rungs = ladder.rungs.filter((r) => r.chance !== null).sort((a, b) => a.strike - b.strike) as (Rung & { chance: number })[];
  const E = ladder.expectedPrice;
  const targets = ref ? extractTargets(posts, symbol, ref, now) : [];
  if (score === null) return { pick: null, reason: "No posts about this token.", targets };
  const lean = score >= 60 ? "bullish" : score <= 40 ? "bearish" : null;
  if (!lean) return { pick: null, reason: "No clear lean to match.", targets };
  if (E === null || rungs.length < 2) return { pick: null, reason: "Not enough live prices on this market.", targets };

  // 1. Target: the weighted level on the lean's side, else the account's usual move (at least 3%).
  const sideTargets = targets.filter((t) => (lean === "bearish" ? t.dir === "down" && t.price < E : t.dir === "up" && t.price > E));
  const total = sideTargets.reduce((s, t) => s + t.weight, 0);
  const typical = Math.max(0.03, Math.abs(record?.avgGain ?? 0));
  const T = total > 0 ? sideTargets.reduce((s, t) => s + t.price * t.weight, 0) / total : E * (lean === "bearish" ? 1 - typical : 1 + typical);

  // 2. The account's centre moves from the market's toward the target by its conviction, scaled down when the
  //    contract settles sooner than a call's horizon (price moves grow with the square root of time).
  const conviction = Math.min(1, Math.abs(score - 50) / 50);
  const left = Math.max(0, new Date(ladder.expiry).getTime() - now);
  const timeScale = Number.isFinite(left) ? Math.sqrt(Math.min(1, left / (HORIZON_DAYS * DAY))) : 1;
  const accountPrice = E + conviction * timeScale * (T - E);
  const shift = accountPrice - E;

  // 3. Credibility from the hit rate (see credibilityOf).
  const credibility = credibilityOf(record);

  // 4. Score every contract on the lean's side.
  const candidates: Candidate[] = [];
  for (const r of rungs) {
    const above = credibility * chanceAt(rungs, r.strike - shift) + (1 - credibility) * r.chance;
    const side = lean === "bullish" ? "yes" : "no";
    const price = side === "yes" ? r.yesAsk : r.noAsk;
    if (price === null || price <= 0 || price >= 1) continue;
    const p = side === "yes" ? above : 1 - above;
    const marketChance = side === "yes" ? r.chance : 1 - r.chance;
    if (p < MIN_CHANCE || marketChance < MIN_CHANCE) continue;
    const edge = p - price;
    if (edge <= 0) continue;
    const b = (1 - price) / price;
    const kelly = edge / (1 - price);
    const growth = p * Math.log(1 + kelly * b) + (1 - p) * Math.log(1 - kelly);
    candidates.push({ side, rung: r, price, chance: marketChance, accountChance: p, marketChance, edge, growth, kelly });
  }
  candidates.sort((a, b) => b.growth - a.growth);
  if (!candidates.length) return { pick: null, reason: "The market already prices this view: no contract has an edge.", targets };

  const best = candidates[0];
  // Show the levels by how much they counted, not by how close they are to the strike.
  const used = sideTargets.map((t) => ({ ...t, share: t.weight / total }));
  return { pick: { ...best, accountPrice, marketPrice: E, target: used[0] ?? null, used, conviction, credibility, candidates }, targets };
}
