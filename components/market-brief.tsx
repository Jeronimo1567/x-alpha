"use client";
// Market brief on the dashboard: Grok Bot's read of how crypto looks right now, saved as part of its routine.
// The mood and headline first, then each coin with its week of prices, then the top voices on X and the big news.

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Newspaper } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { GrokBotLogo } from "@/components/brand-logos";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { HoverCard, HoverCardProfile } from "@/components/arc/hover-card/hover-card";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { card, label, neutralAccent, signed } from "@/components/shared";
import type { BriefVoice, MarketBrief, Mood } from "@/lib/brief";
import { TOKEN_NAMES, TOKENS, type TokenSymbol } from "@/lib/stance";
import type { PriceSeries } from "@/lib/track";

const HOUR = 3_600_000;
const since = (iso: string, now: number) => {
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / HOUR));
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const moodTone = (m: Mood) => (m === "bullish" ? "bg-good-soft text-good" : m === "bearish" ? "bg-bad-soft text-bad" : "bg-foreground/[0.06] text-muted-foreground");
const moodDot = (m: Mood) => (m === "bullish" ? "bg-good" : m === "bearish" ? "bg-bad" : "bg-muted-foreground");

function MoodChip({ mood, className = "" }: { mood: Mood; className?: string }) {
  const Icon = mood === "bullish" ? ArrowUpRight : mood === "bearish" ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${moodTone(mood)} ${className}`}>
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden="true" />{mood}
    </span>
  );
}

/** Grok Bot's routine: re-read every saved account, then write the market brief. Pasted into a scheduled Grok task. */
export function routinePrompt(handles: string[]) {
  const coins = TOKENS.map((t) => `${t} (${TOKEN_NAMES[t]})`).join(", ");
  return `Run the X Alpha routine.

1. Accounts${handles.length ? `: ${handles.join(", ")}` : " (any you are asked to follow)"}. For each one, read every post from the last 7 days on X, label each with the token it is about (${coins}, or none), bullish, bearish or neutral, and a strength from 0 to 1, keeping any price levels in the text. Then call save_account_reading once per account with the handle, display name, profile picture URL, a one or two sentence summary and every post.

2. Market brief. Search X and the news for the last 24 to 48 hours: what the most-followed crypto voices are saying and the biggest stories (ETF flows, regulation, hacks, listings, macro). Then call save_market_brief once with:
- mood (bullish, bearish or mixed), a one-line headline and a 2 to 4 sentence summary
- coins: for each of ${TOKENS.join(", ")} with something worth saying, its mood and one sentence
- voices: 3 to 6 top voices, each with handle, name, profile picture URL, followers, their take in their words, mood and a link to the post
- news: 3 to 6 stories, most important first, each with title, one or two sentence summary, link, source, when it broke, impact (bullish, bearish or mixed) and the coins it is about

Then tell me the overall mood and anything that changed since the last run.`;
}

export function MarketBriefSection({ prices, handles, now }: { prices: Partial<Record<TokenSymbol, PriceSeries>> | null; handles: string[]; now: number }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; brief: MarketBrief | null } | { status: "error" }>({ status: "loading" });
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/brief").then((r) => r.json()).then((b) => { if (live) setState({ status: "ready", brief: b.brief ?? null }); }).catch(() => { if (live) setState({ status: "error" }); });
    load();
    // Pick up a new brief when the routine runs while the page is open.
    const id = setInterval(load, 5 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const copy = <CopyButton value={routinePrompt(handles)} label="Copy routine prompt" />;

  if (state.status === "loading") {
    return <section className={`${card} grid place-items-center py-10`} aria-label="Market brief"><TextShimmer>Loading the market brief…</TextShimmer></section>;
  }
  if (state.status === "error" || !state.brief) {
    return (
      <section className={card} aria-label="Market brief" style={{ ...neutralAccent, "--text-sm": "0.8125rem" } as React.CSSProperties}>
        <EmptyState icon={<Newspaper width={24} height={24} strokeWidth={1.5} />}
          title={state.status === "error" ? "Couldn't load the market brief" : "No market brief yet"}
          description="Grok Bot writes it as part of its routine: what the top voices on X are saying and the big crypto news. Paste the routine prompt into a scheduled Grok task."
          action={copy} />
      </section>
    );
  }

  const b = state.brief;
  const byCoin = new Map(b.coins.map((c) => [c.symbol, c]));
  return (
    <section className={`${card} grid gap-5`} aria-label="Market brief" style={neutralAccent}>
      {/* Mood, headline and the read, with who wrote it and when. */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={label}>Market brief</span>
            <MoodChip mood={b.mood} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><GrokBotLogo className="size-3.5" />Grok Bot · {now ? since(b.savedAt, now) : ""}</span>
            {copy}
          </div>
        </div>
        <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{b.headline}</h2>
        <p className="max-w-3xl leading-relaxed text-muted-foreground text-pretty">{b.summary}</p>
      </div>

      {/* Each coin: its week of prices and Grok's one line on it. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TOKENS.map((t) => {
          const series = prices?.[t]?.filter((_, i, all) => (all.length - 1 - i) % 6 === 0).slice(-28);
          const values = series?.map(([, c]) => c) ?? [];
          const change = values.length > 1 ? (values[values.length - 1] / values[0] - 1) : null;
          const c = byCoin.get(t);
          return (
            <li key={t} className="grid content-start gap-1.5 rounded-lg bg-foreground/[0.03] p-2.5 ring-1 ring-foreground/[0.06]">
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/tokens/${t.toLowerCase()}.svg`} alt="" className="size-4" />{t}
                </span>
                {c && <span className={`size-1.5 rounded-full ${moodDot(c.mood)}`} title={c.mood} />}
              </div>
              {values.length > 1
                ? <Sparkline data={values} label="7D" width={150} height={36} interactive={false}
                    tone={change === null ? "accent" : change >= 0 ? "success" : "danger"} change={change === null ? undefined : signed(change)} />
                : <span className="h-9" />}
              {c && <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{c.note}</p>}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Top voices: hover a face for their profile card. */}
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-semibold">Top voices</h3>
          <ul className="grid gap-2">
            {b.voices.map((v) => <VoiceRow key={v.handle} v={v} />)}
          </ul>
        </div>

        {/* Big news, most important first. */}
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-semibold">Big news</h3>
          <ol className="grid gap-2">
            {b.news.map((n, i) => {
              const Tag = n.url ? "a" : "div";
              return (
                <li key={n.title}>
                  <Tag {...(n.url ? { href: n.url, target: "_blank", rel: "noreferrer" } : {})}
                    className="grid grid-cols-[auto_1fr] gap-3 rounded-lg p-2.5 ring-1 ring-foreground/[0.06] outline-none transition-colors hover:bg-foreground/[0.03] hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="font-mono text-xs leading-5 text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="grid gap-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm leading-5 font-medium text-pretty">{n.title}</span>
                        <MoodChip mood={n.impact} className="shrink-0" />
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground text-pretty">{n.summary}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {n.source && <span className="font-medium text-foreground/80">{n.source}</span>}
                        {n.at && now > 0 && <span>· {since(n.at, now)}</span>}
                        {n.tokens.map((t) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={t} src={`/tokens/${t.toLowerCase()}.svg`} alt={t} title={t} className="size-3.5" />
                        ))}
                        {n.url && <span className="ml-auto">Read ↗</span>}
                      </span>
                    </span>
                  </Tag>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function VoiceRow({ v }: { v: BriefVoice }) {
  const account = { handle: v.handle, name: v.name, avatar: v.avatar, bio: "", followers: v.followers ?? "", posts: [], source: "grok" as const };
  const Tag = v.url ? "a" : "div";
  return (
    <li className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg p-2.5 ring-1 ring-foreground/[0.06]">
      <HoverCard side="top" content={
        <HoverCardProfile name={v.name} role={v.handle} avatar={v.avatar ?? `https://unavatar.io/x/${v.handle.slice(1)}`} bio={v.take}
          stats={[...(v.followers ? [{ label: "Followers", value: v.followers }] : []), { label: "Mood", value: v.mood }]} />
      }>
        <a href={`https://x.com/${v.handle.slice(1)}`} target="_blank" rel="noreferrer" aria-label={`${v.name} on X`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar account={account} className="size-9 text-xs" />
        </a>
      </HoverCard>
      <Tag {...(v.url ? { href: v.url, target: "_blank", rel: "noreferrer" } : {})} className="grid min-w-0 gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm">
            <span className="font-semibold">{v.name}</span> <span className="text-muted-foreground">{v.handle}{v.followers ? ` · ${v.followers}` : ""}</span>
          </span>
          <MoodChip mood={v.mood} className="shrink-0" />
        </span>
        <span className="text-sm leading-snug text-pretty">&ldquo;{v.take}&rdquo;</span>
      </Tag>
    </li>
  );
}
