"use client";
// Market brief on the dashboard: Grok Bot's read of how crypto looks right now, saved as part of its routine.
// The mood and headline first, then each coin with its week of prices, then the top voices on X and the big news.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/arc/motion-tokens";
import { ArrowDownRight, ArrowUpRight, Check, Minus, Newspaper } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { GrokBotLogo } from "@/components/brand-logos";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { HoverCard, HoverCardProfile } from "@/components/arc/hover-card/hover-card";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { card, label, neutralAccent, signed, usd } from "@/components/shared";
import { routinePrompt } from "@/components/grok-prompts";
import type { BriefVoice, MarketBrief, Mood } from "@/lib/brief";
import type { TokenSymbol } from "@/lib/stance";
import type { PriceSeries } from "@/lib/track";

/** The brief's coin row shows only the three main coins. */
const MAIN_COINS: TokenSymbol[] = ["BTC", "ETH", "SOL"];

const HOUR = 3_600_000;
const since = (iso: string, now: number) => {
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / HOUR));
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const moodTone = (m: Mood) => (m === "bullish" ? "bg-good-soft text-good" : m === "bearish" ? "bg-bad-soft text-bad" : "bg-foreground/[0.06] text-muted-foreground");

function MoodChip({ mood, className = "" }: { mood: Mood; className?: string }) {
  const Icon = mood === "bullish" ? ArrowUpRight : mood === "bearish" ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${moodTone(mood)} ${className}`}>
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden="true" />{mood}
    </span>
  );
}

/** The mood as an arrow alone, in a round badge the same height as the Add pill beside it. */
function MoodBadge({ mood }: { mood: Mood }) {
  const Icon = mood === "bullish" ? ArrowUpRight : mood === "bearish" ? ArrowDownRight : Minus;
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${moodTone(mood)}`} title={mood[0].toUpperCase() + mood.slice(1)} aria-label={mood}>
      <Icon className="size-4" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

export function MarketBriefSection({ prices, handles, now, onAdd }: {
  prices: Partial<Record<TokenSymbol, PriceSeries>> | null; handles: string[]; now: number;
  /** A recommended profile's Add button: the dashboard shows the routine prompt with them in it. */
  onAdd: (p: ProfileToAdd) => void;
}) {
  // Short by default: headline, two lines of summary, coins, three voices, three headlines. The rest on request.
  const [full, setFull] = useState(false);
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
      {/* Everything above "Show full brief" grows and shrinks smoothly when it is toggled. */}
      <AutoHeight className="grid gap-5">
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

      {/* The three main coins: their week of prices and Grok's one line on each. */}
      <ul className="grid grid-cols-3 gap-2">
        {MAIN_COINS.map((t) => {
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
                {/* Latest hourly close from Gemini. */}
                {prices?.[t]?.length ? <span className="font-mono text-sm font-medium tabular-nums">{(() => { const p = prices[t]!.at(-1)![1]; return usd(p >= 1000 ? Math.round(p) : p); })()}</span> : null}
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

      {/* Top recommended profiles: hover a face for their profile card. */}
      <div className="grid content-start gap-2">
        <h3 className="text-sm font-semibold">Top recommended profiles</h3>
        <ul className="grid gap-2">
          {(full ? b.voices : b.voices.slice(0, 3)).map((v, i) => <VoiceRow key={v.handle} v={v} full={full} entering={i >= 3} saved={handles.some((h) => h.toLowerCase() === v.handle.toLowerCase())} onAdd={onAdd} />)}
        </ul>
      </div>
      </AutoHeight>

      {(b.summary.length > 160 || b.voices.length > 3 || b.coins.length > 0) && (
        <div className="-mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setFull((f) => !f)} aria-expanded={full}>
            {full ? "Show less" : `Show full brief${b.voices.length > 3 ? ` (${b.voices.length - 3} more)` : ""}`}
          </Button>
        </div>
      )}

    </section>
  );
}

/** Animates its height to fit its content, so expanding or collapsing the brief slides instead of jumping. */
function AutoHeight({ children, className }: { children: React.ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = inner.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    // A few px of padding (cancelled by the negative margin) so row outlines and focus rings aren't clipped.
    <motion.div initial={false} animate={{ height }} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth} style={{ overflow: "hidden" }} className="-m-1">
      <div ref={inner} className={`p-1 ${className ?? ""}`}>{children}</div>
    </motion.div>
  );
}

/** What a recommended profile carries when dragged onto Alpha Profiles (see the drop zone in dashboard.tsx). */
export const PROFILE_DRAG_TYPE = "application/x-alpha-profile";
export type ProfileToAdd = { handle: string; name: string; avatar?: string };

function VoiceRow({ v, full, saved, onAdd, entering = false }: { v: BriefVoice; full: boolean; saved: boolean; onAdd: (p: ProfileToAdd) => void; entering?: boolean }) {
  const account = { handle: v.handle, name: v.name, avatar: v.avatar, bio: "", followers: v.followers ?? "", posts: [], source: "grok" as const };
  const Tag = v.url ? "a" : "div";
  const profile: ProfileToAdd = { handle: v.handle, name: v.name, avatar: v.avatar };
  // What follows the cursor while dragging: a small pill (avatar + name), not the whole row.
  const ghost = useRef<HTMLSpanElement>(null);
  return (
    // Drag the row onto Alpha Profiles to add it; Add does the same for anyone who doesn't drag.
    // The links and picture inside can't be dragged on their own, so grabbing anywhere drags the whole profile.
    <li draggable={!saved}
      onDragStart={(e) => {
        e.dataTransfer.setData(PROFILE_DRAG_TYPE, JSON.stringify(profile));
        e.dataTransfer.effectAllowed = "copy";
        if (ghost.current) e.dataTransfer.setDragImage(ghost.current, 18, 18);
      }}
      className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg p-2.5 ring-1 ring-foreground/[0.06] [&_a]:[-webkit-user-drag:none] [&_img]:[-webkit-user-drag:none] ${saved ? "" : "cursor-grab active:cursor-grabbing"} ${entering ? "animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none" : ""}`}>
      {/* Off screen; only used as the drag image. */}
      <span ref={ghost} aria-hidden="true" className="pointer-events-none fixed -top-96 left-0 flex items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1 text-sm font-medium text-foreground shadow-lg ring-1 ring-foreground/20">
        <Avatar account={account} className="size-7 text-[10px]" />{v.name}
      </span>
      <HoverCard side="top" content={
        <HoverCardProfile name={v.name} role={v.handle} avatar={v.avatar ?? `https://unavatar.io/x/${v.handle.slice(1)}`} bio={v.take}
          stats={[...(v.followers ? [{ label: "Followers", value: v.followers }] : []), { label: "Mood", value: v.mood }]} />
      }>
        <a href={`https://x.com/${v.handle.slice(1)}`} target="_blank" rel="noreferrer" draggable={false} aria-label={`${v.name} on X`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar account={account} className="size-9 text-xs" />
        </a>
      </HoverCard>
      <Tag {...(v.url ? { href: v.url, target: "_blank", rel: "noreferrer" } : {})} draggable={false} className="grid min-w-0 gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 truncate text-sm">
          <span className="font-semibold">{v.name}</span> <span className="text-muted-foreground">{v.handle}{v.followers ? ` · ${v.followers}` : ""}</span>
        </span>
        <span className={`text-sm leading-snug text-pretty ${full ? "" : "line-clamp-2"}`}>&ldquo;{v.take}&rdquo;</span>
      </Tag>
      {/* Their mood as an arrow, then Add to Alpha Profiles (opens the routine prompt, same as dropping the row). */}
      <span className="flex items-center gap-1.5 self-center">
      <MoodBadge mood={v.mood} />
      {saved ? (
        <span className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground ring-1 ring-foreground/10" title="Already in Alpha Profiles">
          <Check className="size-3.5" aria-hidden="true" />Added
        </span>
      ) : (
        <button type="button" onClick={() => onAdd(profile)} title="Add to Alpha Profiles (or drag the row there)"
          aria-label={`Add ${v.handle} to Alpha Profiles`}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none ring-1 ring-foreground/15 transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring">
          <GrokBotLogo className="size-3.5" />Add
        </button>
      )}
      </span>
    </li>
  );
}
