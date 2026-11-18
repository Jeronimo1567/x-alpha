// SAMPLE DATA. These accounts and posts are invented so the app can be built and
// demoed before the X feed is connected. No real person wrote any of this.
// Real version: fetch an account's recent posts with the xAI API's X search tool
// and have the model label each post with a token and a stance.

export type Stance = "bullish" | "bearish" | "neutral";

export type Post = {
  id: string;
  daysAgo: number;
  /** ISO time the post was made, when known. Sample posts only have daysAgo. */
  postedAt?: string;
  text: string;
  url?: string;
  /** Token the post is about, or null if it is not about a tradeable token. */
  token: "BTC" | "ETH" | "SOL" | "XRP" | null;
  stance: Stance;
  /** How strongly the post leans, 0 to 1. */
  strength: number;
};

export type Account = {
  handle: string; name: string; bio: string; followers: string; posts: Post[];
  /** "grok" when Grok Bot sent this reading in. Sample accounts leave it unset. */
  source?: "grok";
  /** Profile picture URL, when known. */
  avatar?: string;
  analyzedAt?: string;
};

export const ACCOUNTS: Account[] = [
  {
    handle: "@sample_chainwatcher",
    name: "Chain Watcher (sample)",
    bio: "Invented account for the demo. Posts mostly about SOL and BTC.",
    followers: "412K",
    posts: [
      { id: "a1", daysAgo: 0, text: "SOL fees are back to nothing and volume is up three days running. Hard to stay bearish here.", token: "SOL", stance: "bullish", strength: 0.8 },
      { id: "a2", daysAgo: 0, text: "Coffee, charts, repeat.", token: null, stance: "neutral", strength: 0 },
      { id: "a3", daysAgo: 1, text: "Added to my SOL bag this morning. Not selling before the end of the month.", token: "SOL", stance: "bullish", strength: 0.9 },
      { id: "a4", daysAgo: 1, text: "BTC looks heavy under resistance. I would wait for a clean break before buying.", token: "BTC", stance: "bearish", strength: 0.5 },
      { id: "a5", daysAgo: 2, text: "ETH gas is cheap because nobody is using it. That is not the win people think it is.", token: "ETH", stance: "bearish", strength: 0.7 },
      { id: "a6", daysAgo: 3, text: "Every SOL dip this month got bought within hours.", token: "SOL", stance: "bullish", strength: 0.6 },
      { id: "a7", daysAgo: 4, text: "BTC dominance still climbing. Respect it.", token: "BTC", stance: "bullish", strength: 0.4 },
      { id: "a8", daysAgo: 5, text: "Took some SOL profit. Too many people agree with me.", token: "SOL", stance: "bearish", strength: 0.4 },
      { id: "a9", daysAgo: 8, text: "SOL is range-bound. Nothing to do.", token: "SOL", stance: "neutral", strength: 0.2 },
      { id: "a10", daysAgo: 9, text: "Bought BTC on the flush. Simple trade.", token: "BTC", stance: "bullish", strength: 0.7 },
      { id: "a11", daysAgo: 11, text: "ETH/BTC keeps bleeding. I do not see the bottom yet.", token: "ETH", stance: "bearish", strength: 0.8 },
    ],
  },
  {
    handle: "@sample_macrobear",
    name: "Macro Bear (sample)",
    bio: "Invented account for the demo. Skeptical of most rallies.",
    followers: "128K",
    posts: [
      { id: "b1", daysAgo: 0, text: "This BTC bounce is on no volume. I am not chasing it.", token: "BTC", stance: "bearish", strength: 0.7 },
      { id: "b2", daysAgo: 1, text: "Shorted ETH again. Same thesis as last week.", token: "ETH", stance: "bearish", strength: 0.9 },
      { id: "b3", daysAgo: 2, text: "XRP is the only chart that looks alive right now.", token: "XRP", stance: "bullish", strength: 0.6 },
      { id: "b4", daysAgo: 3, text: "BTC needs to hold this level or it gets ugly.", token: "BTC", stance: "bearish", strength: 0.5 },
      { id: "b5", daysAgo: 4, text: "SOL holders are very confident. That usually ends one way.", token: "SOL", stance: "bearish", strength: 0.6 },
      { id: "b6", daysAgo: 6, text: "Covered my BTC short. Will reload higher.", token: "BTC", stance: "neutral", strength: 0.2 },
      { id: "b7", daysAgo: 9, text: "XRP still doing nothing. Watching.", token: "XRP", stance: "neutral", strength: 0.2 },
      { id: "b8", daysAgo: 10, text: "BTC rally into the meeting. Could squeeze a bit more.", token: "BTC", stance: "bullish", strength: 0.4 },
    ],
  },
];
