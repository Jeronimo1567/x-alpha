"use client";
// Market brief on the dashboard: Grok Bot's read of how crypto looks right now, saved as part of its routine.
// The mood and headline first, then each coin with its week of prices, then the top voices on X and the big news.

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Newspaper } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { GrokBotLogo } from "@/components/brand-logos";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { HoverCard, HoverCardProfile } from "@/components/arc/hover-card/hover-card";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { card, label, neutralAccent, signed } from "@/components/shared";
import { promptFor, routinePrompt } from "@/components/grok-prompts";
import type { BriefVoice, MarketBrief, Mood, SuggestedAccount } from "@/lib/brief";
import { TOKENS, type TokenSymbol } from "@/lib/stance";
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

export function MarketBriefSection({ prices, handles, now, onSaved }: {
  prices: Partial<Record<TokenSymbol, PriceSeries>> | null; handles: string[]; now: number;
  /** Reloads the saved accounts, so one Grok Bot adds after a copied prompt shows up in Recent Profiles. */
  onSaved: () => void;
}) {
  // After a suggestion's prompt is copied, check for the new reading every 15s for 10 minutes.
  const [waitUntil, setWaitUntil] = useState(0);
  // Short by default: headline, two lines of summary, coins, three voices, three headlines. The rest on request.
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!waitUntil) return;
    const id = setInterval(() => { if (Date.now() > waitUntil) { clearInterval(id); setWaitUntil(0); } else onSaved(); }, 15_000);
    return () => clearInterval(id);
  }, [waitUntil, onSaved]);
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
        <p className={`max-w-3xl leading-relaxed text-muted-foreground text-pretty ${full ? "" : "line-clamp-2"}`}>{b.summary}</p>
      </div>

      {/* Each coin: its week of prices and Grok's one line on it. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TOKENS.map((t) => {
          const series = prices?.[t]?.filter((_, i, all) => (all.length - 1 - i) % 6 === 0).slice(-28);
          const values = series?.map(([, c]) => c) ?? [];
          const change = values.length > 1 ? (values[values.length - 1] / values[0] - 1) : null;
          const c = byCoin.get(t);
          return (
            <li key={t} title={c?.note} className="grid content-start gap-1.5 rounded-lg bg-foreground/[0.03] p-2.5 ring-1 ring-foreground/[0.06]">
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
              {full && c && <p className="text-xs leading-snug text-muted-foreground">{c.note}</p>}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Top voices: hover a face for their profile card. */}
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-semibold">Top voices</h3>
          <ul className="grid gap-2">
            {(full ? b.voices : b.voices.slice(0, 3)).map((v) => <VoiceRow key={v.handle} v={v} full={full} />)}
          </ul>
        </div>

        {/* Big news, most important first. */}
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-semibold">Big news</h3>
          <ol className="grid gap-2">
            {(full ? b.news : b.news.slice(0, 3)).map((n, i) => {
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
                      {full && <span className="text-xs leading-relaxed text-muted-foreground text-pretty">{n.summary}</span>}
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

      {(b.summary.length > 160 || b.voices.length > 3 || b.news.length > 3 || b.coins.length > 0) && (
        <div className="-mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setFull((f) => !f)} aria-expanded={full}>
            {full ? "Show less" : `Show full brief${b.news.length > 3 || b.voices.length > 3 ? ` (${Math.max(0, b.voices.length - 3) + Math.max(0, b.news.length - 3)} more)` : ""}`}
          </Button>
        </div>
      )}

      {/* Accounts Grok Bot thinks are worth adding, minus the ones already saved. Copy the prompt to have Grok read one. */}
      {(() => {
        const saved = new Set(handles.map((h) => h.toLowerCase()));
        const fresh = (b.suggested ?? []).filter((a) => !saved.has(a.handle.toLowerCase()));
        if (!fresh.length) return null;
        return (
          <div className="grid gap-2 border-t border-foreground/[0.07] pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Accounts to add</h3>
              <span className="text-xs text-muted-foreground">Copy the prompt and send it to Grok Bot to start tracking them.</span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {fresh.map((a) => <SuggestionCard key={a.handle} a={a} onCopied={() => setWaitUntil(Date.now() + 10 * 60_000)} />)}
            </ul>
          </div>
        );
      })()}
    </section>
  );
}

function SuggestionCard({ a, onCopied }: { a: SuggestedAccount; onCopied: () => void }) {
  const account = { handle: a.handle, name: a.name, avatar: a.avatar, bio: "", followers: a.followers ?? "", posts: [], source: "grok" as const };
  return (
    <li className="grid content-between gap-3 rounded-lg p-3 ring-1 ring-foreground/[0.08]">
      <div className="grid gap-2">
        <a href={`https://x.com/${a.handle.slice(1)}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar account={account} className="size-9 text-xs" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-semibold">{a.name}</span>
            <span className="truncate text-xs text-muted-foreground">{a.handle}{a.followers ? ` · ${a.followers}` : ""}</span>
          </span>
          {a.tokens.length > 0 && (
            <span className="ml-auto flex shrink-0 -space-x-1">
              {a.tokens.slice(0, 3).map((t) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={t} src={`/tokens/${t.toLowerCase()}.svg`} alt={t} title={t} className="size-4 rounded-full bg-card ring-2 ring-card" />
              ))}
            </span>
          )}
        </a>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{a.why}</p>
      </div>
      <CopyButton value={promptFor(a.handle.slice(1))} label="Copy prompt" onCopied={onCopied} />
    </li>
  );
}

function VoiceRow({ v, full }: { v: BriefVoice; full: boolean }) {
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
        <span className={`text-sm leading-snug text-pretty ${full ? "" : "line-clamp-2"}`}>&ldquo;{v.take}&rdquo;</span>
      </Tag>
    </li>
  );
}
