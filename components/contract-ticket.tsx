// A Gemini contract laid out like Gemini's own market card: the coin and the market's question with the live price,
// then the strike with its payout multiple and the side to buy as a pill, tinted in the side's colour, and the trade button.
// Used by the Account tab's best contract and by each side on Compare.

import { ArrowUpRight } from "lucide-react";
import { GeminiLogo } from "@/components/brand-logos";
import { cents, geminiUrl, shortWhen, usd, when } from "@/components/shared";
import type { Ladder, Rung } from "@/lib/gemini";
import type { Pick } from "@/lib/pick";
import type { Account } from "@/lib/sample";
import { Avatar } from "@/components/account-avatar";
import { TOKEN_NAMES, type TokenSymbol } from "@/lib/stance";

export function ContractTicket({ symbol, ladder, side, rung, price, current, live, cta = "Trade on Gemini" }: {
  symbol: TokenSymbol; ladder: Ladder; side: "yes" | "no"; rung: Rung; price: number;
  current: number | null; live: boolean; cta?: string;
}) {
  const yes = side === "yes";
  const multiple = (1 / price).toFixed(1);
  return (
    <div className={`grid gap-3 rounded-xl p-3.5 ring-1 ${yes ? "bg-good-soft/25 ring-good/25" : "bg-bad-soft/25 ring-bad/25"}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/[0.07]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt="" className="size-6" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[15px] leading-snug font-semibold text-pretty">{ladder.title.replace(new RegExp(`^${symbol}\\b`), TOKEN_NAMES[symbol])}?</span>
          {current !== null && <span className="text-xs text-muted-foreground">Current: <span className="font-medium text-foreground tabular-nums">{usd(current)}</span></span>}
        </div>
        {live && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-bad" aria-hidden="true" />Live
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="grid min-w-0">
          <span className="text-[15px] font-semibold tabular-nums">{rung.label}</span>
          <span className="text-xs text-muted-foreground">Settles {when(ladder.expiry)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-good tabular-nums" title={`Pays $1 per share if right: ${multiple}× what you paid`}>{multiple}x</span>
          <span className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-[1.5px] ${yes ? "text-good ring-good" : "text-bad ring-bad"}`}>
            {yes ? "Yes" : "No"} <span className="tabular-nums">{cents(price)}</span>
          </span>
        </div>
      </div>

      <a href={geminiUrl(ladder)} target="_blank" rel="noreferrer"
        className="group flex h-10 items-center justify-center gap-2 rounded-[12px] bg-foreground px-4 text-sm font-semibold text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-5 place-items-center rounded-full bg-neutral-950 text-white"><GeminiLogo className="size-3" /></span>
        {cta}
        <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * No contract to show: the same card shape as a skeleton, dimmed, with why there's no pick laid over it, and
 * room underneath for other markets worth a look.
 */
export function ContractTicketEmpty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  const bar = "rounded-full bg-foreground/[0.08]";
  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden rounded-xl p-3.5 ring-1 ring-foreground/10">
        {/* Skeleton of the ticket. */}
        <div aria-hidden="true" className="grid gap-3 opacity-60 blur-[1px] select-none">
          <div className="flex items-start gap-3">
            <span className="size-10 shrink-0 rounded-lg bg-foreground/[0.07]" />
            <div className="grid flex-1 gap-2 pt-1"><span className={`h-3 w-3/4 ${bar}`} /><span className={`h-2.5 w-1/3 ${bar}`} /></div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="grid flex-1 gap-2"><span className={`h-3 w-1/2 ${bar}`} /><span className={`h-2.5 w-1/3 ${bar}`} /></div>
            <span className="h-9 w-24 rounded-full ring-[1.5px] ring-foreground/10" />
          </div>
          <span className="h-10 rounded-[12px] bg-foreground/[0.06]" />
        </div>
        {/* Why there's no pick, over the skeleton. */}
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className="grid max-w-xs justify-items-center gap-1 rounded-xl bg-card/85 px-4 py-3 text-center shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm">
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-xs leading-relaxed text-muted-foreground text-pretty">{body}</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export type OtherMarket = { index: number; ladder: Ladder; pick: Pick };

/** Other places worth a look when there's no pick: other dates on this coin with an edge, and coins they lean on. */
export function OtherMarkets({ others, leaning, onLadder, onCoin }: {
  others: OtherMarket[]; leaning: TokenSymbol[]; onLadder: (i: number) => void; onCoin: (t: TokenSymbol) => void;
}) {
  if (!others.length && !leaning.length) return null;
  const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-foreground/15 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Might be worth a look</span>
      <div className="flex flex-wrap gap-1.5">
        {others.slice(0, 3).map((o) => (
          <button key={o.ladder.ticker} type="button" onClick={() => onLadder(o.index)} className={chip}>
            <span className="text-muted-foreground">{shortWhen(o.ladder.expiry)}</span>
            <span className={`font-semibold ${o.pick.side === "yes" ? "text-good" : "text-bad"}`}>{o.pick.side === "yes" ? "Yes" : "No"} {cents(o.pick.price)}</span>
            <span className="text-muted-foreground">{o.pick.rung.label}</span>
          </button>
        ))}
        {leaning.map((t) => (
          <button key={t} type="button" onClick={() => onCoin(t)} className={`${chip} font-medium`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/tokens/${t.toLowerCase()}.svg`} alt="" className="size-3.5" />{t}
          </button>
        ))}
      </div>
    </div>
  );
}

const DAY = 86_400_000;
const postedOn = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The post behind a pick, styled like a small X card: the one that named the price level the pick is built on, or,
 * with no level named, their strongest post on this coin on the lean's side. The words that set the level are marked.
 */
export function SourceTweet({ account, pick, symbol, now = Date.now(), badge, fill = false }: { account: Account; pick: Pick; symbol: TokenSymbol; now?: number; /** Shown at the foot of the post, e.g. the confidence. */ badge?: React.ReactNode;
  /** Fill the height it is given, with the "why" line inside the card, so it can sit level with the contract. */ fill?: boolean }) {
  const lean = pick.side === "yes" ? "bullish" : "bearish";
  const post = pick.target
    ? account.posts.find((p) => p.id === pick.target!.postId)
    : account.posts.filter((p) => p.token === symbol && p.stance === lean).sort((a, b) => b.strength - a.strength || a.daysAgo - b.daysAgo)[0];
  if (!post) return null;
  const at = pick.target?.postedAt ?? (post.postedAt ? new Date(post.postedAt).getTime() : now - post.daysAgo * DAY);
  const url = post.url ?? pick.target?.url;

  // Show the part of the post around the words the level came from, with those words marked, so the reason is
  // visible even in a long post. Link shorteners are dropped.
  const body = post.text.replace(/\s*https:\/\/t\.co\/\S+/g, "").trim();
  const q = pick.target?.quote.replace(/^[.…\s]+|[.…\s]+$/g, "").replace(/\s+h(t(t(ps?)?)?)?(:\/*\S*)?$/, "").replace(/\s*https?:\/\/\S*/g, "").trim() ?? "";
  // The quote can start or end mid-word; widen the mark to whole words.
  let i = q ? body.indexOf(q) : -1, j = i < 0 ? -1 : i + q.length;
  if (i >= 0) { while (i > 0 && !/\s/.test(body[i - 1])) i--; while (j < body.length && !/\s/.test(body[j])) j++; }
  const BEFORE = 140, AFTER = 80;
  const start = i > BEFORE ? body.lastIndexOf(" ", i - BEFORE) + 1 || i - BEFORE : 0;
  const end = i >= 0 && body.length - j > AFTER ? body.indexOf(" ", j + AFTER) : -1;
  const text = i < 0
    ? body
    : <>{start > 0 && "… "}{body.slice(start, i)}<mark className="rounded bg-foreground/15 px-0.5 font-medium text-foreground">{body.slice(i, j)}</mark>{body.slice(j, end < 0 ? undefined : end)}{end >= 0 && " …"}</>;

  const Tag = url ? "a" : "div";
  const why = (
    <span className="text-xs text-muted-foreground">
      {pick.target ? <>Why this market: they named <span className="font-medium text-foreground">{usd(pick.target.price)}</span></> : "Why this market: no level named, so it follows their lean"}
    </span>
  );
  return (
    <div className={fill ? "grid h-full" : "grid gap-1.5"}>
      {/* Next to the contract the post speaks for itself; elsewhere a line says why it was picked. */}
      {!fill && why}
      <Tag {...(url ? { href: url, target: "_blank", rel: "noreferrer" } : {})}
        className={`grid gap-2 rounded-xl bg-foreground/[0.03] p-3 ring-1 ring-foreground/10 outline-none transition-colors hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring ${fill ? "grid-rows-[auto_1fr_auto] p-3.5" : ""}`}>
        <div className="flex items-center gap-2">
          <Avatar account={account} className="size-7 text-[10px]" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{account.name}</div>
            <div className="truncate text-xs text-muted-foreground">{account.handle} · {postedOn(at)}</div>
          </div>
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 self-start fill-current text-foreground/80" aria-label="Post on X" role="img">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </div>
        <p className={`text-sm leading-snug whitespace-pre-line ${i < 0 ? "line-clamp-5" : ""}`}>{text}</p>
        {(url || badge) && (
          <div className="flex items-center justify-between gap-2">
            {badge ?? <span />}
            {url && <span className="text-xs text-muted-foreground">Open on X ↗</span>}
          </div>
        )}
      </Tag>
    </div>
  );
}
