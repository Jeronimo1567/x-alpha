// The prompts the person copies and pastes to Grok Bot: research one account, or run the whole routine.
import { TOKEN_NAMES, TOKENS } from "@/lib/stance";
import { ONCHAIN } from "@/lib/onchain-sources";

/** The tokens get_onchain_flow covers, for the prompts. */
const ONCHAIN_TOKENS = Object.keys(ONCHAIN).join(", ");
/** The coins the market brief shows a card for. Keep in step with MAIN_COINS in components/market-brief.tsx. */
const BRIEF_COINS = "BTC, ETH and SOL";
const BRIEF_COINS_ANY = "BTC, ETH or SOL";

/** What Grok Bot is asked to do. Never shown: the person only copies it and pastes it to their Grok Bot. */
export function promptFor(handle: string) {
  return `Research the X account @${handle} for X Alpha.

1. Read every post @${handle} made in the last 7 days on X.
2. Label each post with the token it is about (${TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ")}, or none) and whether the author sounds bullish, bearish or neutral, with a strength from 0 (passing remark) to 1 (clear call). Keep any price levels they name in the text.
3. Call the X Alpha tool save_account_reading once with: handle "@${handle}", their display name, their profile picture URL (https://pbs.twimg.com/...), a one or two sentence summary of what they focused on this week, and every post with its text, posted_at (ISO 8601), url, token, stance and strength.

4. If you haven't in the last few hours, also write the market brief: search X and the news for the last 24 to 48 hours and call save_market_brief with the overall mood, a headline, a short summary, one line each on ${BRIEF_COINS}, and 3 to 6 recommended profiles (accounts making clear calls on those coins, worth adding to X Alpha).

5. For their clearest call this week on ${ONCHAIN_TOKENS}, call get_onchain_flow with the post's time and side, to see whether big wallets traded the same way.

6. Call get_track_record for @${handle} to see whether their past calls beat the market (BTC, or a coin basket for BTC calls) at 1h, 1d, 3d and 7d, not just whether they made money.

Then tell me their lean on each token, the matching Gemini contract X Alpha returns, whether big wallets agreed with their calls, and whether their record beats the market or just rides it (and at which horizon their edge peaks).`;
}

/** Grok Bot's routine: re-read every saved account, then write the market brief. Pasted into a scheduled Grok task. */
export function routinePrompt(handles: string[]) {
  const coins = TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ");
  return `Run the X Alpha routine.

1. Accounts${handles.length ? `: ${handles.join(", ")}` : " (any you are asked to follow)"}. This list replaces any earlier one: include every account on it, including any added since the last run. For each one, read every post from the last 7 days on X, label each with the token it is about (${coins}, or none), bullish, bearish or neutral, and a strength from 0 to 1, keeping any price levels in the text. Then call save_account_reading once per account with the handle, display name, profile picture URL, a one or two sentence summary and every post.

2. Market brief. Search X and the news for the last 24 to 48 hours: what the most-followed crypto accounts are saying and what moved the market (ETF flows, regulation, hacks, listings, macro). Then call save_market_brief once with:
Keep it short, it is read at a glance:
- mood (bullish, bearish or mixed), a headline of 12 words or fewer and a summary of two short sentences
- coins: one entry each for ${BRIEF_COINS}, with its mood and one short sentence
- voices: 3 to 6 recommended profiles, X accounts worth following on X Alpha because they made clear, specific calls on ${BRIEF_COINS_ANY} in the last 48 hours (a clear side, ideally named price levels; no news bots). Each with handle, name, profile picture URL, followers, their call in one sentence in their words, mood and a link to the post. X Alpha shows them as "Top recommended profiles" with an Add button
- suggested_accounts: 2 to 4 more accounts X Alpha isn't following yet that made clear calls on these coins this week, each with handle, name, profile picture URL, followers, one sentence on why, and the coins they call
- next_run_at: when this scheduled task will run the routine next (ISO 8601 with time zone), and schedule: the schedule in a few words, like "Every day at 9:00 AM ET". X Alpha shows it as the next routine run.
- No news list is needed: X Alpha no longer shows one.

3. Onchain check. For each account's clearest call this week on ${ONCHAIN_TOKENS}, call get_onchain_flow with the post's time and side to see whether big wallets traded the same way.

4. Track record. For each account, call get_track_record and note its verdict (beats, rides, trails, unclear or few) and where its edge peaks.

Then tell me the overall mood, anything that changed since the last run, any call the big wallets went against, and which accounts actually beat the market (not just rode it).`;
}
