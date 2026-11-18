// The prompts the person copies and pastes to Grok Bot: research one account, or run the whole routine.
import { TOKEN_NAMES, TOKENS } from "@/lib/stance";

/** What Grok Bot is asked to do. Never shown: the person only copies it and pastes it to their Grok Bot. */
export function promptFor(handle: string) {
  return `Research the X account @${handle} for X Alpha.

1. Read every post @${handle} made in the last 7 days on X.
2. Label each post with the token it is about (${TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ")}, or none) and whether the author sounds bullish, bearish or neutral, with a strength from 0 (passing remark) to 1 (clear call). Keep any price levels they name in the text.
3. Call the X Alpha tool save_account_reading once with: handle "@${handle}", their display name, their profile picture URL (https://pbs.twimg.com/...), a one or two sentence summary of what they focused on this week, and every post with its text, posted_at (ISO 8601), url, token, stance and strength.

4. If you haven't in the last few hours, also write the market brief: search X and the news for the last 24 to 48 hours (top crypto voices and the biggest stories) and call save_market_brief with the overall mood, a headline, a short summary, a line per coin, 3 to 6 voices and 3 to 6 news stories.

Then tell me their lean on each token and the matching Gemini contract X Alpha returns.`;
}

/** Grok Bot's routine: re-read every saved account, then write the market brief. Pasted into a scheduled Grok task. */
export function routinePrompt(handles: string[]) {
  const coins = TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ");
  return `Run the X Alpha routine.

1. Accounts${handles.length ? `: ${handles.join(", ")}` : " (any you are asked to follow)"}. For each one, read every post from the last 7 days on X, label each with the token it is about (${coins}, or none), bullish, bearish or neutral, and a strength from 0 to 1, keeping any price levels in the text. Then call save_account_reading once per account with the handle, display name, profile picture URL, a one or two sentence summary and every post.

2. Market brief. Search X and the news for the last 24 to 48 hours: what the most-followed crypto voices are saying and the biggest stories (ETF flows, regulation, hacks, listings, macro). Then call save_market_brief once with:
Keep it short, it is read at a glance:
- mood (bullish, bearish or mixed), a headline of 12 words or fewer and a summary of two short sentences
- coins: for each of ${TOKENS.join(", ")} with something worth saying, its mood and one short sentence
- voices: 3 to 6 top voices, each with handle, name, profile picture URL, followers, their take in one sentence in their words, mood and a link to the post
- news: 3 to 6 stories, most important first, each with a short title, a one-sentence summary, link, source, when it broke, impact (bullish, bearish or mixed) and the coins it is about
- suggested_accounts: 2 to 4 X accounts X Alpha isn't following yet that made clear, specific calls on these coins this week (named price levels, a clear side; no news bots), each with handle, name, profile picture URL, followers, one sentence on why, and the coins they call

Then tell me the overall mood and anything that changed since the last run.`;
}
