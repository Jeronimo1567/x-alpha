// A small MCP server (Streamable HTTP, stateless) so an agent such as Grok Bot can
// call X Alpha's tools. It reads Gemini's public market data and stores account readings. No trades.
import { cleanBrief, getBrief, saveBrief } from "@/lib/brief";
import { ladders, matchContract, type Ladder } from "@/lib/gemini";
import { cleanAvatar, cleanHandle, cleanPosts, getReading, saveReading, toAccount, type Reading } from "@/lib/readings";
import { allPrices } from "@/lib/prices";
import { lean, stances, TOKEN_NAMES, TOKENS } from "@/lib/stance";
import { bestContract } from "@/lib/pick";
import { HORIZON_DAYS, trackRecord } from "@/lib/track";

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
      `Send X Alpha your reading of an X account. First read the account's posts from the last 7 days on X yourself, then call this once with every post, each labelled with the token it is about (${COINS}, or null) and whether the author sounds bullish, bearish or neutral. X Alpha stores it, shows it on the dashboard, and returns the account's lean per token with the matching live Gemini prediction contract.`,
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
      `Part of the routine, after reading the accounts: send X Alpha a brief on how crypto looks right now. Search X and the news for the last 24 to 48 hours yourself: what the most-followed crypto voices are saying, and the biggest stories (ETF flows, regulation, hacks, listings, macro), and 2 to 4 accounts worth adding. X Alpha shows it on the dashboard. Each run replaces the last brief.`,
    inputSchema: {
      type: "object",
      properties: {
        mood: { ...MOOD, description: "Overall mood of the crypto market right now." },
        headline: { type: "string", description: "One short line, like a newspaper headline, on the state of the market." },
        summary: { type: "string", description: "Two to four sentences: what moved, why, and what people are watching next." },
        coins: {
          type: "array", maxItems: 6, description: `One entry per coin X Alpha tracks (${COINS}) that has something worth saying.`,
          items: { type: "object", properties: { symbol: symbolProp, mood: MOOD, note: { type: "string", description: "One sentence on that coin." } }, required: ["symbol", "mood", "note"], additionalProperties: false },
        },
        voices: {
          type: "array", maxItems: 8, description: "The top voices on X driving the conversation, 3 to 6 of them.",
          items: {
            type: "object",
            properties: {
              handle: { type: "string", description: "X username, like @example." },
              name: { type: "string", description: "Display name." },
              profile_image_url: { type: "string", description: "Profile picture URL from X (https://pbs.twimg.com/...)." },
              followers: { type: "string", description: "Follower count, short, like 1.2M." },
              take: { type: "string", description: "Their view in one or two sentences, close to their words." },
              mood: MOOD,
              url: { type: "string", description: "Link to the post that best shows the take." },
            },
            required: ["handle", "take", "mood"], additionalProperties: false,
          },
        },
        news: {
          type: "array", maxItems: 8, description: "The biggest stories, 3 to 6, most important first.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }, summary: { type: "string", description: "One or two sentences." },
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
      },
      required: ["mood", "headline", "summary", "voices", "news"], additionalProperties: false,
    },
  },
  {
    name: "get_market_brief",
    description: "The last market brief saved to X Alpha, to compare against before writing a new one.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_account_reading",
    description: "The reading X Alpha has stored for an X account: when it was last analyzed, its lean per token this week and last week, its track record (how often its past calls were right), and the matching Gemini contracts. Use it to compare against a new week.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "The X username, like @example." } }, required: ["handle"], additionalProperties: false },
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
];

const summarize = (l: Ladder) => ({
  market: l.title, ticker: l.ticker, settles: l.expiry, expected_price: round(l.expectedPrice),
  levels: l.rungs.filter((r) => r.chance !== null).map((r) => ({ at_or_above: r.strike, chance: round(r.chance) })),
});

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
      method: `Each bullish or bearish post is judged on the price move over the ${HORIZON_DAYS} days after it (Gemini hourly prices).`,
      overall: fmt(t.overall),
      by_token: t.byToken.filter((b) => b.settled + b.open > 0).map((b) => ({ token: b.token, ...fmt(b) })),
    };
  } catch { /* prices are optional here */ }
  return {
    handle: "@" + r.handle, analyzed_at: r.analyzedAt, posts_stored: r.posts.length, leans, track_record,
    dashboard: origin, note: "Scores: 0 fully bearish, 50 neutral, 100 fully bullish. Contracts are for review only. Nothing was traded.",
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
    return { saved: true, saved_at: b.savedAt, coins: b.coins.length, voices: b.voices.length, news: b.news.length, suggested_accounts: b.suggested?.length ?? 0, dashboard: ctx.origin };
  }
  if (name === "get_market_brief") return (await getBrief()) ?? { message: "No brief saved yet. Use save_market_brief." };
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
        serverInfo: { name: "x-alpha", version: "0.4.0" },
        instructions: `X Alpha turns an X account's recent posts into a lean per crypto token (${COINS}) and matches it to live Gemini prediction market odds. Read the account on X, then call save_account_reading. As part of each routine run, also call save_market_brief with how crypto looks overall: top voices on X and the big news. Nothing here places trades.`,
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
