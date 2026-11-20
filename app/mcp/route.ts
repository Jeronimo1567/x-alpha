// A small MCP server (Streamable HTTP, stateless) so an agent such as Grok Bot can
// call X Alpha's tools. It reads Gemini's public market data, stores account readings,
// and reads large-wallet swaps in the main tokens from QuickNode Streams. No trades.
import { cleanBrief, getBrief, saveBrief } from "@/lib/brief";
import { ladders, matchContract, type Ladder } from "@/lib/gemini";
import { cleanAvatar, cleanHandle, cleanPosts, getReading, saveReading, toAccount, type Reading } from "@/lib/readings";
import { allPrices } from "@/lib/prices";
import { lean, stances, TOKEN_NAMES, TOKENS, type TokenSymbol } from "@/lib/stance";
import { bestContract } from "@/lib/pick";
import { HORIZON_DAYS, HORIZONS, marketVerdict, MIN_SETTLED, trackRecord, type Scorecard } from "@/lib/track";
import { postImpact } from "@/lib/impact";
import { pricesAround } from "@/lib/prices";
import { loadSwaps, ONCHAIN } from "@/lib/swaps";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const round = (n: number | null, d = 2) => (n === null ? null : Number(n.toFixed(d)));

const COINS = TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ");
const MOOD = { type: "string", enum: ["bullish", "bearish", "mixed"] } as const;
const symbolProp = { type: "string", enum: [...TOKENS], description: `Token symbol: ${COINS}.` };
const horizonProp = {
  type: "string", enum: ["soonest", "longest"],
  description: "Which open market to use: the one that settles soonest, or the longest-dated one (usually month-end). Default: longest.",
};

const postItem = {
  type: "object",
  properties: {
    text: { type: "string", description: "The post's text." },
    posted_at: { type: "string", description: "When it was posted, ISO 8601." },
    url: { type: "string", description: "Link to the post on X." },
    token: { type: ["string", "null"], enum: [...TOKENS, null], description: `Token the post is about: ${COINS}. Use null for any other coin or topic.` },
    stance: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "The author's lean on that token in this post." },
    strength: { type: "number", minimum: 0, maximum: 1, description: "How strongly the post leans. 0.2 is a passing remark, 0.9 is a clear call." },
  },
  required: ["text", "posted_at", "token", "stance"],
};

const TOOLS = [
  {
    name: "save_account_reading",
    description:
      `Send X Alpha your reading of an X account. First read the account's posts from the last 7 days on X yourself, then call this once with every post, each labelled with the token it is about (${COINS}, or null) and whether the author sounds bullish, bearish or neutral. X Alpha stores it, shows it on the dashboard under Alpha Profiles, and returns the account's lean per token with the matching live Gemini prediction contract.`,
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "The X username, like @example." },
        display_name: { type: "string", description: "The account's display name." },
        profile_image_url: { type: "string", description: "The account's profile picture URL from X (https://pbs.twimg.com/...). Always include it so the dashboard shows who this is." },
        summary: { type: "string", description: "One or two sentences on what the account focused on this week." },
        posts: { type: "array", items: postItem, minItems: 1, maxItems: 100 },
      },
      required: ["handle", "summary", "posts"], additionalProperties: false,
    },
  },
  {
    name: "save_market_brief",
    description:
      `Part of the routine, after reading the accounts: send X Alpha a brief on how crypto looks right now. Search X and the news for the last 24 to 48 hours yourself: the overall mood, one line each on BTC, ETH and SOL, and 3 to 6 recommended profiles (accounts making clear calls on those coins, shown on the dashboard as "Top recommended profiles" with an Add button), plus 2 to 4 more accounts worth adding. Each run replaces the last brief. Also say when your scheduled task runs this routine next (next_run_at) and its schedule, so the dashboard can show when fresh data is due.`,
    inputSchema: {
      type: "object",
      properties: {
        mood: { ...MOOD, description: "Overall mood of the crypto market right now." },
        headline: { type: "string", description: "A headline of 12 words or fewer on the state of the market." },
        summary: { type: "string", description: "Two short sentences, under 300 characters: what moved and what people are watching." },
        coins: {
          type: "array", maxItems: 6, description: `One entry each for BTC, ETH and SOL (the coins the dashboard shows). Others (${COINS}) are accepted but not shown.`,
          items: { type: "object", properties: { symbol: symbolProp, mood: MOOD, note: { type: "string", description: "One short sentence on that coin, under 100 characters." } }, required: ["symbol", "mood", "note"], additionalProperties: false },
        },
        voices: {
          type: "array", maxItems: 8, description: "3 to 6 recommended profiles: X accounts worth following on X Alpha because they made clear, specific calls on BTC, ETH or SOL in the last 48 hours (a clear side, ideally named price levels; no news bots). Shown as \"Top recommended profiles\" with an Add button.",
          items: {
            type: "object",
            properties: {
              handle: { type: "string", description: "X username, like @example." },
              name: { type: "string", description: "Display name." },
              profile_image_url: { type: "string", description: "Profile picture URL from X (https://pbs.twimg.com/...)." },
              followers: { type: "string", description: "Follower count, short, like 1.2M." },
              take: { type: "string", description: "Their call in one sentence, under 140 characters, close to their words." },
              mood: MOOD,
              url: { type: "string", description: "Link to the post that best shows the take." },
            },
            required: ["handle", "take", "mood"], additionalProperties: false,
          },
        },
        news: {
          type: "array", maxItems: 8, description: "Optional and not shown on the dashboard any more; leave it out.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Under 80 characters." }, summary: { type: "string", description: "One sentence, under 160 characters." },
              url: { type: "string", description: "Link to the story." }, source: { type: "string", description: "Outlet or account, like CoinDesk or @WatcherGuru." },
              at: { type: "string", description: "When it broke, ISO 8601." },
              impact: { ...MOOD, description: "Likely effect on crypto prices." },
              tokens: { type: "array", items: { type: "string", enum: [...TOKENS] }, description: "Coins it is mainly about, if any." },
            },
            required: ["title", "summary", "impact"], additionalProperties: false,
          },
        },
        suggested_accounts: {
          type: "array", maxItems: 6,
          description: "2 to 4 X accounts worth adding to X Alpha that it isn't following yet: people making clear, specific calls on the coins it tracks (named price levels, a clear side), not news bots.",
          items: {
            type: "object",
            properties: {
              handle: { type: "string", description: "X username, like @example." },
              name: { type: "string", description: "Display name." },
              profile_image_url: { type: "string", description: "Profile picture URL from X (https://pbs.twimg.com/...)." },
              followers: { type: "string", description: "Follower count, short, like 1.2M." },
              why: { type: "string", description: "One sentence on why they're worth following, from what they posted this week." },
              tokens: { type: "array", items: { type: "string", enum: [...TOKENS] }, description: "Coins they mostly call." },
            },
            required: ["handle", "why"], additionalProperties: false,
          },
        },
        next_run_at: { type: "string", description: "When your scheduled task will run this routine next, ISO 8601 with time zone. Leave it out if this run wasn't scheduled." },
        schedule: { type: "string", description: "The task's schedule in a few words, like \"Every day at 9:00 AM ET\"." },
      },
      required: ["mood", "headline", "summary", "voices"], additionalProperties: false,
    },
  },
  {
    name: "get_market_brief",
    description: "The last market brief saved to X Alpha, to compare against before writing a new one.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_account_reading",
    description: "The reading X Alpha has stored for an X account: when it was last analyzed, its lean per token this week and last week, its track record (how often its past calls were right, and how often they beat the market at 1h, 1d, 3d and 7d), and the matching Gemini contracts with how much the account's view was trusted. Use it to compare against a new week.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "The X username, like @example." } }, required: ["handle"], additionalProperties: false },
  },
  {
    name: "get_track_record",
    description:
      "How an account's past calls held up against the market, at 1 hour, 1 day, 3 days and 7 days after each post. For each horizon: calls settled, plain hit rate (made money), alpha hit rate (beat the market), mean alpha per call and a t-stat. The market is BTC for altcoin calls and an equal-weight basket of all tracked coins for BTC calls. Also says where the account's edge peaks (edge decay) and gives one verdict: beats, rides (right only because the market moved), trails, unclear or few. Use it to judge how much an account's view should count before trusting a contract pick.",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "The X username, like @example." },
        symbol: { ...symbolProp, description: `Only calls on this token (${COINS}). Leave out for every call.` },
      },
      required: ["handle"], additionalProperties: false,
    },
  },
  {
    name: "get_market_odds",
    description:
      "Live Gemini prediction market odds for a crypto token's price. For each open market it returns when it settles, the price the market expects (50% chance of finishing higher), and the chance of finishing at or above each price level.",
    inputSchema: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"], additionalProperties: false },
  },
  {
    name: "find_matching_contract",
    description:
      "Given a bullish or bearish lean on a token, returns the Gemini prediction contract that expresses it: which side to take, what it costs per $1 payout, and the market's chance of it paying. Read-only: places no trade.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProp, lean: { type: "string", enum: ["bullish", "bearish"] }, horizon: horizonProp },
      required: ["symbol", "lean"], additionalProperties: false,
    },
  },
  {
    name: "get_onchain_flow",
    description:
      "What happened around one call on a main token: the price from 12 hours before the post to 24 hours after it (Gemini candles), and large-wallet buying and selling onchain over the same window (swaps of $10k or more, from X Alpha's QuickNode Streams). Says whether the call is right so far and whether big wallets went the same way. Covers SOL (Solana), ETH and BTC (as WBTC) on Ethereum.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolProp,
        posted_at: { type: "string", description: "When the post was made, ISO 8601." },
        stance: { type: "string", enum: ["bullish", "bearish"], description: "Which way the post called it." },
      },
      required: ["symbol", "posted_at", "stance"], additionalProperties: false,
    },
  },
];

const summarize = (l: Ladder) => ({
  market: l.title, ticker: l.ticker, settles: l.expiry, expected_price: round(l.expectedPrice),
  levels: l.rungs.filter((r) => r.chance !== null).map((r) => ({ at_or_above: r.strike, chance: round(r.chance) })),
});

const BENCHMARK_NOTE = "alpha = the call's return minus the market's move over the same window, in the call's direction. Market: BTC for altcoin calls; an equal-weight basket of all tracked coins for BTC calls.";

/** One scorecard against the market, per horizon, shaped for an agent. */
function vsMarket(x: Scorecard) {
  const v = marketVerdict(x);
  return {
    verdict: v.kind, verdict_horizon: v.horizon,
    edge_peaks_at: x.decay.peak, edge_gone_by: x.decay.fadesBy, edge_tentative: x.decay.tentative,
    by_horizon: HORIZONS.map((h) => {
      const t = x.horizons[h.key];
      return {
        horizon: h.key, calls_settled: t.settled, hit_rate: round(t.hitRate), alpha_hit_rate: round(t.alphaHitRate),
        mean_gain: round(t.meanGain, 4), mean_alpha: round(t.meanAlpha, 4), t_stat: round(t.tStat), significance: t.signal === "too few" ? `n too small (<${MIN_SETTLED})` : t.signal,
      };
    }),
  };
}

/** Lean per token plus the matching Gemini contract for each clear lean. */
async function report(r: Reading, origin: string) {
  const prices = await allPrices().catch(() => ({} as Awaited<ReturnType<typeof allPrices>>));
  const leans = await Promise.all(
    stances(toAccount(r)).filter((s) => s.score !== null).map(async (s) => {
      const side = s.score! >= 60 ? "bullish" : s.score! <= 40 ? "bearish" : null;
      let contract: unknown = null;
      if (side) {
        try {
          const all = await ladders(s.symbol);
          const ladder = all[all.length - 1];
          const account = toAccount(r);
          const series = prices[s.symbol];
          const record = series ? trackRecord(account.posts, { [s.symbol]: series }).byToken.find((t) => t.token === s.symbol) ?? null : null;
          const { pick: m, reason } = ladder ? bestContract({ ladder, symbol: s.symbol, score: s.score, posts: account.posts, record, ref: series?.at(-1)?.[1] ?? null }) : { pick: null, reason: "No open market." };
          contract = m ? {
            contract: `${m.side === "yes" ? "Yes" : "No"} on "${s.symbol} ${m.rung.label}"`, market: ladder.title, settles: ladder.expiry,
            cost_per_1_dollar_payout: m.price, market_chance_of_paying: round(m.marketChance), account_chance_of_paying: round(m.accountChance),
            edge_per_dollar: round(m.edge), account_expected_price: round(m.accountPrice, 0),
            credibility: {
              weight_0_to_1: round(m.credibility), horizon: m.credibilityBasis.horizon,
              basis: m.credibilityBasis.basis === "alpha" ? "share of calls that beat the market" : `share of calls that made money (fewer than ${MIN_SETTLED} could be compared with the market)`,
              calls: m.credibilityBasis.n, hits: m.credibilityBasis.hits,
            },
            based_on: m.used.length
              ? m.used.map((t) => ({ level: t.price, direction: t.dir, weight_share: round(t.share), quote: t.quote, post: t.url ?? null }))
              : "The account's lean and typical move (no price level named).",
            other_options: m.candidates.slice(1, 3).map((c) => ({ contract: `${c.side === "yes" ? "Yes" : "No"} on "${s.symbol} ${c.rung.label}"`, cost: c.price, account_chance: round(c.accountChance), market_chance: round(c.marketChance) })),
          } : { contract: null, why: reason };
        } catch { /* odds are optional here */ }
      }
      return {
        token: s.symbol, lean: lean(s.score), score_0_to_100: Math.round(s.score!), posts_this_week: s.posts,
        last_week_score: s.lastWeek === null ? null : Math.round(s.lastWeek), matching_contract: contract,
      };
    }),
  );
  let track_record: unknown = null;
  try {
    const t = trackRecord(toAccount(r).posts, await allPrices());
    const fmt = (x: { settled: number; right: number; avgGain: number | null; open: number }) => ({
      calls_judged: x.settled, calls_right: x.right, avg_gain_following_calls: round(x.avgGain, 4), calls_still_open: x.open,
    });
    track_record = {
      method: `Each bullish or bearish post is judged on the price move over the ${HORIZON_DAYS} days after it (Gemini hourly prices). vs_market grades the same calls at 1h, 1d, 3d and 7d against the market: ${BENCHMARK_NOTE}`,
      overall: { ...fmt(t.overall), vs_market: vsMarket(t.overall) },
      by_token: t.byToken.filter((b) => b.settled + b.open > 0).map((b) => ({ token: b.token, ...fmt(b), vs_market: vsMarket(b) })),
    };
  } catch { /* prices are optional here */ }
  return {
    handle: "@" + r.handle, analyzed_at: r.analyzedAt, posts_stored: r.posts.length, leans, track_record,
    dashboard: origin, note: "Scores: 0 fully bearish, 50 neutral, 100 fully bullish. Contracts are for review only. Nothing was traded.",
  };
}

/** Price and large-wallet flow around one call, shaped for an agent: dollars rounded, one line per flag. */
async function onchainFlow(symbol: TokenSymbol, postAt: number, stance: "bullish" | "bearish") {
  const HOUR = 3_600_000;
  const cover = ONCHAIN[symbol];
  if (!cover) return { symbol, message: `Onchain flow isn't tracked for ${symbol} yet. Covered: ${Object.keys(ONCHAIN).join(", ")}.` };
  const [swaps, candles] = await Promise.all([loadSwaps(symbol, postAt - 12 * HOUR, postAt + 24 * HOUR), pricesAround(symbol, postAt - 12 * HOUR)]);
  const i = postImpact({ swaps, candles, postAt, stance });
  const usd = (n: number) => Math.round(n);
  return {
    symbol, stance, posted_at: new Date(postAt).toISOString(),
    onchain_source: i.simulated ? "SIMULATED swaps (demo), not real QuickNode data" : `QuickNode Streams: ${cover.source}, swaps of $10k or more`,
    price_at_post: i.priceAtPost, price_now: i.priceNow, change_since_post: round(i.change, 4), move_in_call_direction: round(i.callMove, 4),
    large_flow_12h_before: { bought_usd: usd(i.before.buyUsd), sold_usd: usd(i.before.sellUsd), net_usd: usd(i.before.netUsd), swaps: i.before.trades },
    large_flow_after: { bought_usd: usd(i.after.buyUsd), sold_usd: usd(i.after.sellUsd), net_usd: usd(i.after.netUsd), swaps: i.after.trades, wallets: i.after.wallets },
    left_out_two_way_wallets: { wallets: i.excluded.wallets, swaps: i.excluded.trades, usd: usd(i.excluded.usd), why: "Bought and sold similar amounts, or swapped 20+ times, in this window: market makers and bots. Flows above count only wallets taking a side." },
    verdict: i.flags.map((f) => `${f.label}: ${f.detail}`),
  };
}

async function callTool(name: string, args: Record<string, unknown>, ctx: { canWrite: boolean; origin: string }) {
  if (name === "save_account_reading") {
    if (!ctx.canWrite) throw new Error("This server needs its key to save readings. Reconnect using the MCP address that ends in ?key=...");
    const handle = cleanHandle(args.handle);
    const saved = await saveReading({
      handle, posts: cleanPosts(args.posts), avatar: cleanAvatar(args.profile_image_url),
      name: String(args.display_name ?? "@" + handle).slice(0, 80), summary: String(args.summary ?? "").slice(0, 400),
    });
    return { saved: true, profile_picture_saved: Boolean(saved.avatar), ...(await report(saved, ctx.origin)) };
  }
  if (name === "save_market_brief") {
    if (!ctx.canWrite) throw new Error("This server needs its key to save. Reconnect using the MCP address that ends in ?key=...");
    const b = await saveBrief(cleanBrief(args));
    return {
      saved: true, saved_at: b.savedAt, coins: b.coins.length, recommended_profiles: b.voices.length, suggested_accounts: b.suggested?.length ?? 0,
      next_run_at: b.nextRunAt ?? null, schedule: b.schedule ?? null,
      ...(b.nextRunAt ? {} : { note: "No next_run_at saved: the dashboard guesses the next run as 24 hours after this one. Send next_run_at (a future ISO time) next run." }),
      dashboard: ctx.origin,
    };
  }
  if (name === "get_market_brief") return (await getBrief()) ?? { message: "No brief saved yet. Use save_market_brief." };
  if (name === "get_onchain_flow") {
    const symbol = String(args.symbol ?? "").toUpperCase();
    if (!(TOKENS as readonly string[]).includes(symbol)) throw new Error(`symbol must be one of ${TOKENS.join(", ")}`);
    const at = Date.parse(String(args.posted_at ?? ""));
    if (Number.isNaN(at)) throw new Error("posted_at must be an ISO date");
    if (args.stance !== "bullish" && args.stance !== "bearish") throw new Error("stance must be bullish or bearish");
    return onchainFlow(symbol as TokenSymbol, at, args.stance);
  }
  if (name === "get_track_record") {
    const handle = cleanHandle(args.handle);
    const r = await getReading(handle);
    if (!r) return { handle: "@" + handle, message: "No reading stored for this account yet. Use save_account_reading first." };
    const symbol = args.symbol == null ? null : String(args.symbol).toUpperCase();
    if (symbol !== null && !(TOKENS as readonly string[]).includes(symbol)) throw new Error(`symbol must be one of ${TOKENS.join(", ")}`);
    const t = trackRecord(toAccount(r).posts, await allPrices());
    const x = symbol ? t.byToken.find((b) => b.token === symbol)! : t.overall;
    const calls = t.calls.filter((c) => !symbol || c.token === symbol);
    return {
      handle: "@" + r.handle, token: symbol ?? "all", calls: calls.length, calls_right_3d: x.right, calls_settled_3d: x.settled,
      method: BENCHMARK_NOTE, ...vsMarket(x),
      recent_calls: calls.slice(0, 10).map((c) => ({
        token: c.token, stance: c.stance, posted_at: new Date(c.postedAt).toISOString(), post: c.url ?? null,
        ...Object.fromEntries(Object.entries(c.horizons).map(([k, g]) => [k, { gain: round(g.gain, 4), market: round(g.benchmark, 4), alpha: round(g.alpha, 4), settled: g.settled }])),
      })),
      note: `Few calls make every number noisy: treat anything marked "n too small" as a hint, and a t_stat under 2 as weak. Calls posted close together overlap, so the t_stat flatters busy accounts.`,
    };
  }
  if (name === "get_account_reading") {
    const handle = cleanHandle(args.handle);
    const r = await getReading(handle);
    return r ? await report(r, ctx.origin) : { handle: "@" + handle, message: "No reading stored for this account yet. Use save_account_reading first." };
  }

  const symbol = String(args.symbol ?? "").toUpperCase();
  if (!(TOKENS as readonly string[]).includes(symbol)) throw new Error(`symbol must be one of ${TOKENS.join(", ")}`);
  const all = await ladders(symbol);
  if (all.length === 0) return { symbol, message: `Gemini has no open ${symbol} price markets right now.` };

  if (name === "get_market_odds") return { symbol, source: "Gemini prediction markets (live)", markets: all.map(summarize) };

  if (name === "find_matching_contract") {
    const lean = args.lean;
    if (lean !== "bullish" && lean !== "bearish") throw new Error("lean must be bullish or bearish");
    const ladder = args.horizon === "soonest" ? all[0] : all[all.length - 1];
    const m = matchContract(ladder, lean);
    if (!m) return { symbol, lean, market: ladder.title, message: "No contract with a live price on that side right now." };
    return {
      symbol, lean, market: ladder.title, settles: ladder.expiry, expected_price: round(ladder.expectedPrice),
      contract: `${m.side === "yes" ? "Yes" : "No"} on "${symbol} ${m.rung.label}"`,
      instrument: m.rung.instrument, cost_per_1_dollar_payout: m.price, market_chance_of_paying: round(m.chance),
      note: "For review only. Nothing was traded.",
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: Rpc, ctx: { canWrite: boolean; origin: string }) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0" as const, id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "x-alpha", version: "0.7.0" },
        instructions: [
          `X Alpha turns an X account's recent posts into a lean per crypto token (${COINS}) and matches it to live Gemini prediction market odds. Nothing here places trades.`,
          "One account: read its posts on X yourself, then call save_account_reading.",
          "The routine (usually a scheduled task): re-read every saved account with save_account_reading (the routine prompt lists them all, including any just added), then call save_market_brief with how crypto looks overall (one line each on BTC, ETH and SOL, 3 to 6 recommended profiles, accounts worth adding). In save_market_brief, always send next_run_at (when your scheduled task runs next, ISO 8601) and schedule, so the dashboard shows when fresh data is due.",
          "Track record: get_track_record says how an account's past calls did against the market (BTC for altcoins, a coin basket for BTC) at 1h, 1d, 3d and 7d. An account that is mostly right only because everything rallied shows as \"rides\"; weigh it below one that \"beats\" the market. X Alpha's contract picks already weight each account by this.",
          `Onchain check: for an account's clearest recent calls on ${Object.keys(ONCHAIN).join(", ")}, call get_onchain_flow with the post's time and side to see whether big wallets traded the same way (swaps of $10k or more from X Alpha's QuickNode Streams). It only has swaps from when the Streams started, so a call with no swaps yet is not a finding.`,
        ].join("\n\n"),
      });
    }
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      try {
        const out = await callTool(String(msg.params?.name), (msg.params?.arguments ?? {}) as Record<string, unknown>, ctx);
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0" as const, id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

/** Saving needs the shared key, sent as ?key=... or as a Bearer token. With no key configured (local dev), saving is open. */
function canWrite(request: Request): boolean {
  const expected = process.env.X_ALPHA_KEY;
  if (!expected) return true;
  const given = new URL(request.url).searchParams.get("key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return given === expected;
}

export async function POST(request: Request) {
  const ctx = { canWrite: canWrite(request), origin: new URL(request.url).origin };
  let body: Rpc | Rpc[];
  try { body = await request.json(); } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  // Messages without an id are notifications and get no reply.
  const replies = await Promise.all((batch ? body as Rpc[] : [body as Rpc]).filter((m) => m.id !== undefined).map((m) => handle(m, ctx)));
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: CORS });
}

// This server keeps no session and sends no server-initiated messages.
export function GET() { return new Response("This MCP endpoint accepts POST only.", { status: 405, headers: { ...CORS, Allow: "POST" } }); }
export function DELETE() { return new Response(null, { status: 405, headers: CORS }); }
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
