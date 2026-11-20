# X Alpha

**Trade the timeline.** Paste an X account. Grok Bot reads its calls; X Alpha prices them against Gemini prediction markets.

**Live demo:** [hackathon-x-signal.vercel.app](https://hackathon-x-signal.vercel.app/)

Built for the UBC 2026 Hackathon (University Blockchain Conference, Austin).

## What it does

Crypto Twitter is full of confident calls. X Alpha checks whether an account's calls are worth following, and if they are, which live prediction market contract expresses their view best.

1. **Read the account.** You enter an X handle and X Alpha gives you a prompt for Grok Bot. Grok reads the account's posts from the last 7 days, labels each one with the coin it's about (BTC, ETH, SOL, XRP, ZEC or HYPE), whether it's bullish, bearish or neutral, and how strong the call is, then saves the reading to X Alpha through its MCP server.
2. **Score the lean.** Each account gets a 0 to 100 bullish/bearish score per coin, with newer and stronger posts weighted more (a post counts half as much every 3 days), plus how that lean compares with the week before.
3. **Grade the track record.** Every past call is graded against real Gemini price history at 1 hour, 1 day, 3 days and 7 days. It checks two things: did the call make money, and did it **beat the market** (the same move minus what BTC, or a coin basket for BTC calls, did over the same window). That separates accounts with an edge from accounts that just rode a rally.
4. **Pick a contract.** X Alpha pulls Gemini's live crypto prediction markets (hourly, daily and month-end price ladders) and finds the contract that best fits the account's view: it uses price levels the account named in its posts, shifts the market's odds toward that target, discounts by the account's track record, and ranks contracts by Kelly growth. If no contract has an edge, it says so. It links to the market on Gemini; it never places trades.
5. **Check the onchain flow.** For SOL, ETH and BTC (via WBTC and cbBTC on Ethereum), QuickNode Streams record swaps of $10k or more. For any call, X Alpha shows the price and large-wallet buying and selling from 12 hours before the post to 24 hours after, so you can see whether big wallets traded the same way. Market-maker and bot wallets that trade both ways are filtered out.

## Features

- **Dashboard:** "Alpha Profiles" cards for every saved account, with their lean per coin, a 14-day stance chart, "following their calls" returns, return vs market and an edge verdict (for example "Edge unclear", "Trails the market", "Too early to tell").
- **Market brief:** Grok Bot's daily read on the market (overall mood, a headline, one line each on BTC, ETH and SOL with 7-day price charts) and "Top recommended profiles" you can add with one click or by dragging.
- **Account view:** one account's posts, a price chart with each call marked, track record by coin and horizon, the best Gemini contract and the onchain flow around each call.
- **Compare view:** two accounts head to head on lean, record, beating the market and best contract.
- **Grok Bot routine:** a copyable prompt for a scheduled Grok task that re-reads every saved account and writes a fresh market brief.
- **Source status:** live indicators for Grok Bot, Gemini and QuickNode in the header.
- Sample accounts (clearly labelled "Sample", invented posts) so the app works before any real readings exist.
- Light and dark themes.

## How it works

| Piece | Role |
| --- | --- |
| Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 | The web app and API routes |
| Grok Bot (xAI) | Reads X accounts and the news, and calls X Alpha's MCP tools |
| MCP server at `/mcp` | Streamable HTTP, stateless. Tools: `save_account_reading`, `save_market_brief`, `get_market_brief`, `get_account_reading`, `get_track_record`, `get_market_odds`, `find_matching_contract`, `get_onchain_flow` |
| Gemini public APIs | Prediction market odds and hourly / 15-minute price candles (no key needed) |
| QuickNode Streams | Large swaps on Solana and Ethereum, filtered by `quicknode/solana-filter.js` and `quicknode/ethereum-filter.js` and delivered to `/api/streams` (HMAC-signed) |
| Upstash Redis | Stores readings, the market brief and swaps on Vercel. Without it, everything is kept in `.data/` on disk |
| Vercel | Hosting |

### API routes

- `GET /api/readings`, `DELETE /api/readings?handle=…`: saved account readings
- `GET /api/brief`: the latest market brief
- `GET /api/prices`: hourly price history for every tracked coin
- `GET /api/odds?symbol=BTC`: live Gemini prediction market ladders
- `GET /api/impact?token=SOL&at=<ISO time>&stance=bullish`: price and large-wallet flow around a call
- `POST /api/streams`: QuickNode Streams webhook
- `GET /api/streams/status`: whether the Streams are delivering
- `POST /api/streams/simulate`: made-up swaps for rehearsing the onchain chart (off in production unless enabled, always labelled "Simulated")

## Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no environment variables set, the app runs on the sample accounts and stores anything Grok sends in `.data/`.

To print every account's track record in the terminal:

```bash
node scripts/alpha-report.mjs
```

### Environment variables

All optional. Set them in `.env.local` or in your Vercel project.

| Name | What it's for |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis connection (set by the Vercel Marketplace integration). `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` work too |
| `X_ALPHA_KEY` | Protects the MCP server: callers pass it as `?key=` or a Bearer token |
| `QUICKNODE_STREAM_TOKEN` | Stream security token(s), comma-separated, used to verify webhook signatures |
| `X_ALPHA_ALLOW_SIM` | Set to `1` to allow the swap simulator in production |
| `NEXT_PUBLIC_GROK_ROUTINE_HOURS` | How often the scheduled Grok routine runs, for the "next update" estimate (default 24) |

### Connecting Grok Bot

Add the deployed `/mcp` endpoint as an MCP server in Grok (with `?key=` if you set `X_ALPHA_KEY`). Then paste the prompt X Alpha gives you for an account, or the routine prompt into a scheduled Grok task.

## Notes

- Analysis only: X Alpha never trades and holds no funds.
- The sample accounts and their posts are invented and marked as samples.
- `DELETE /api/readings` is open on purpose for the hackathon demo; add a key check before real use.

Made by [@jeronimoxyz](https://x.com/jeronimoxyz).
