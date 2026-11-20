"use client";
// Home view: look up an X account and copy a research prompt for Grok Bot, and every saved profile as a card
// with a mini chart of how following its calls would have gone. The header's Compare tab ranks them side by side.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, SearchX, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { GrokBotLogo } from "@/components/brand-logos";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { motionTokens } from "@/components/arc/motion-tokens";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { HoldToConfirm } from "@/components/arc/hold-to-confirm/hold-to-confirm";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { AsciiBackdrop } from "@/components/ascii-backdrop";
import { MarketBriefSection, PROFILE_DRAG_TYPE, type ProfileToAdd } from "@/components/market-brief";
import { promptFor, routinePrompt } from "@/components/grok-prompts";
import { card, date, displayName, label, neutralAccent, sideOf, signed } from "@/components/shared";
import type { Account } from "@/lib/sample";
import { stances, type TokenSymbol } from "@/lib/stance";
import { BeatMarketBadge } from "@/components/alpha-record";
import { followCurve, leanHistory, MAIN_HORIZON, trackRecord, type PriceSeries, type Scorecard } from "@/lib/track";

type Prices = Partial<Record<TokenSymbol, PriceSeries>> | null;

/** Everything a profile card or compare row shows, worked out once per account. */
export type ProfileSummary = {
  account: Account; overall: Scorecard | null; curve: { values: number[]; dates: number[] } | null; total: number | null;
  /** Following every call, minus what the market did over the same windows (3 days per call), in percent. */
  alphaTotal: number | null;
  leans: { symbol: TokenSymbol; score: number; side: "bullish" | "bearish" | null }[];
  /** Daily lean on their most-posted token over the last 14 days. */
  history: { symbol: TokenSymbol; values: (number | null)[]; dates: number[] } | null;
};

/** `now` is 0 until the page mounts; the lean history waits for it so the prerender never reads the clock. */
export function summarize(account: Account, prices: Prices, now = 0): ProfileSummary {
  const record = prices ? trackRecord(account.posts, prices) : null;
  const curve = record ? followCurve(record.calls) : null;
  const leans = stances(account)
    .filter((s) => s.score !== null)
    .sort((a, b) => b.posts - a.posts)
    .map((s) => ({ symbol: s.symbol, score: s.score!, side: sideOf(s.score) as "bullish" | "bearish" | null }));
  const main = leans[0]?.symbol;
  const history = main && now ? { symbol: main, ...leanHistory(account.posts, main, 14, now) } : null;
  const alphaCurve = record ? followCurve(record.calls, "alpha") : null;
  return {
    account, overall: record?.overall ?? null, curve, total: curve ? curve.values[curve.values.length - 1] : null,
    alphaTotal: alphaCurve ? alphaCurve.values[alphaCurve.values.length - 1] : null, leans, history,
  };
}

const handleOf = (raw: string) => raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#\s]/)[0].toLowerCase();
const validHandle = (h: string) => /^[a-z0-9_]{1,15}$/.test(h);

export function Dashboard({ accounts, prices, now, onOpen, onSaved, onRemove }: {
  accounts: Account[]; prices: Prices; now: number;
  onOpen: (handle: string) => void;
  /** A reading arrived (from Grok now, or picked up later from the queue): reload the account list. */
  onSaved: () => void;
  /** Removes a profile from the list (deletes a saved reading, hides a sample). */
  onRemove: (handle: string) => void;
}) {
  const [query, setQuery] = useState("");
  // A recommended profile dropped on (or added to) Alpha Profiles: shows the routine prompt with them in it.
  const [adding, setAdding] = useState<ProfileToAdd | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const grokHandles = accounts.filter((a) => a.source === "grok").map((a) => a.handle);
  // After the prompt is copied, reload every 15s for 10 minutes so the new profile shows up when Grok saves it.
  const [waitUntil, setWaitUntil] = useState(0);
  useEffect(() => {
    if (!waitUntil) return;
    const id = setInterval(() => { if (Date.now() > waitUntil) { clearInterval(id); setWaitUntil(0); } else onSaved(); }, 15_000);
    return () => clearInterval(id);
  }, [waitUntil, onSaved]);
  const isProfileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(PROFILE_DRAG_TYPE);
  // Recomputed when the clock ticks over to a new hour, not on every 30s tick.
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const summaries = useMemo(() => accounts.map((a) => summarize(a, prices, hour)), [accounts, prices, hour]);

  const q = query.trim().replace(/^@/, "").toLowerCase();
  const shown = q ? summaries.filter((s) => s.account.handle.toLowerCase().includes(q) || s.account.name.toLowerCase().includes(q)) : summaries;

  return (
    <div className="grid gap-4">
      <Research query={query} setQuery={setQuery} accounts={accounts} onSaved={onSaved} />

      <MarketBriefSection prices={prices} now={now} handles={grokHandles} onAdd={setAdding} />

      {/* Drop zone for recommended profiles dragged from the market brief. */}
      <section aria-label="Saved profiles"
        onDragOver={(e) => { if (isProfileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!dragOver) setDragOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={(e) => {
          setDragOver(false);
          const raw = e.dataTransfer.getData(PROFILE_DRAG_TYPE);
          if (!raw) return;
          e.preventDefault();
          try { setAdding(JSON.parse(raw)); } catch { /* not a profile */ }
        }}
        className={`relative grid gap-3 rounded-xl transition-[box-shadow,background-color] ${dragOver ? "bg-foreground/[0.03] ring-2 ring-foreground/40 ring-offset-8 ring-offset-background" : ""}`}>
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-xl bg-background/70 backdrop-blur-sm">
            <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium ring-1 ring-foreground/15"><GrokBotLogo className="size-4" />Drop to add to Alpha Profiles</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-semibold">Alpha Profiles</h2>
          </div>
        </div>

        {/* Arc's empty state sizes its description with --text-sm; one step smaller here. */}
        {shown.length === 0 ? (
          <div className={card} style={{ "--text-sm": "0.75rem" } as CSSProperties}>
            <EmptyState icon={<SearchX width={24} height={24} strokeWidth={1.5} />}
              title={`No saved profile matches "${query.trim()}"`}
              description={validHandle(handleOf(query)) ? `Press Enter to get a Grok Bot prompt for @${handleOf(query)}.` : "Try a different name or @handle."} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <li key={s.account.handle}>
                <ProfileCard s={s} onOpen={() => onOpen(s.account.handle)} onRemove={() => onRemove(s.account.handle)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && (
        <AddProfileDialog profile={adding} handles={grokHandles} onClose={() => setAdding(null)}
          onCopied={() => setWaitUntil(Date.now() + 10 * 60_000)} />
      )}
    </div>
  );
}

/**
 * Shown when a recommended profile is dropped on Alpha Profiles (or its Add is pressed): Grok Bot is what reads an
 * account, so the next step is to update the Grok Bot routine with this prompt, which now includes the new profile.
 */
function AddProfileDialog({ profile, handles, onClose, onCopied }: { profile: ProfileToAdd; handles: string[]; onClose: () => void; onCopied: () => void }) {
  const handle = profile.handle.startsWith("@") ? profile.handle : "@" + profile.handle;
  const all = [...new Set([...handles, handle])];
  const account = { handle, name: profile.name, avatar: profile.avatar, bio: "", followers: "", posts: [], source: "grok" as const };
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Add ${handle} to Alpha Profiles`} onClick={(e) => e.stopPropagation()}
        className={`${card} grid w-full max-w-md gap-4 p-6 shadow-2xl`} style={neutralAccent}>
        <div className="flex items-center gap-3">
          <Avatar account={account} className="size-12 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">Add {profile.name} to Alpha Profiles</p>
            <p className="truncate text-xs text-muted-foreground">{handle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-2 rounded-lg bg-foreground/[0.04] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><GrokBotLogo className="size-4" />Update your Grok Bot routine</p>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Copy this prompt, paste it into your Grok Bot routine and send it. Grok Bot will read {handle} along with your {handles.length} other {handles.length === 1 ? "profile" : "profiles"} and add them here.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">{copied ? "Copied. Waiting for Grok Bot…" : `${all.length} profiles in the routine`}</span>
          <CopyButton value={routinePrompt(all)} label="Copy routine prompt" onCopied={() => { setCopied(true); onCopied(); }} />
        </div>
      </div>
    </div>
  );
}

/** Lean chip: token icon, arrow and how sure, e.g. "SOL ↗ 82%". */
export function LeanChip({ symbol, score, side }: ProfileSummary["leans"][number]) {
  const Arrow = side === "bullish" ? ArrowUpRight : ArrowDownRight;
  const tone = side === "bullish" ? "bg-good-soft text-good" : side === "bearish" ? "bg-bad-soft text-bad" : "bg-foreground/[0.06] text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${tone}`} title={side ? `${side} on ${symbol}` : `mixed on ${symbol}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt="" className="size-3.5" />
      {symbol}
      {side ? <Arrow className="size-3" strokeWidth={2.75} aria-hidden="true" /> : "•"}
      {Math.round(side === "bearish" ? 100 - score : score)}%
    </span>
  );
}

const leanText = (v: number) => (v >= 60 ? `${Math.round(v)}% bullish` : v <= 40 ? `${Math.round(100 - v)}% bearish` : "mixed");

/**
 * Mini chart of the account's lean on its main token, day by day for two weeks, on a fixed bearish-to-bullish
 * scale so a small wobble looks small. Headline: today's lean and how far it moved in a week.
 */
export function LeanSparkline({ s, width = 160, height = 30, interactive = true }: { s: ProfileSummary; width?: number; height?: number; interactive?: boolean }) {
  const h = s.history;
  const first = h?.values.findIndex((v) => v !== null) ?? -1;
  if (!h) return <div className="grid h-[72px] place-items-center text-xs text-muted-foreground">{s.leans.length ? "Loading…" : "No token posts in the last two weeks"}</div>;
  if (first === -1) return <div className="grid h-[72px] place-items-center text-xs text-muted-foreground">No token posts in the last two weeks</div>;
  // Before their first post the line starts at their first lean; quiet days after it keep the last lean.
  const filled: number[] = [];
  for (const v of h.values.slice(first)) filled.push(v ?? filled[filled.length - 1] ?? 50);
  const dates = h.dates.slice(first);
  const now = filled[filled.length - 1];
  const weekAgo = filled.length > 7 ? filled[filled.length - 8] : filled[0];
  const side = sideOf(now);
  return (
    <Sparkline data={filled} domain={[0, 100]} label={`${h.symbol} · 14d`} value={leanText(now)}
      change={filled.length < 2 ? "new" : Math.round(now) === Math.round(weekAgo) ? "same as last week" : `was ${leanText(weekAgo)}`}
      tone={side === "bullish" ? "success" : side === "bearish" ? "danger" : "accent"} width={width} height={height}
      labels={dates.map((t) => date(new Date(t).toISOString()))} formatValue={(v) => leanText(v)} interactive={interactive} />
  );
}

function ProfileCard({ s, onOpen, onRemove }: { s: ProfileSummary; onOpen: () => void; onRemove: () => void }) {
  const a = s.account;
  const sample = a.source !== "grok";
  const [confirming, setConfirming] = useState(false);
  return (
    // minmax(0, 1fr): the chart's one-line headline can't widen the column past the card.
    // The whole card opens the profile; the name button is the keyboard route.
    <article onClick={onOpen} className={`${card} relative grid h-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden p-4 transition-shadow hover:ring-foreground/25`}
      style={{ ...neutralAccent, "--accent": "var(--foreground)" } as CSSProperties}>
      {/* Centred on the avatar, and the bin pulled to the card's edge so its icon lines up with the content below. */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="flex min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar account={a} className="size-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{displayName(a)}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.handle}{sample && " · Sample"}</span>
          </span>
        </button>
        <span className="-mr-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" aria-label={`Remove ${a.handle}`} title="Remove from Alpha Profiles" onClick={() => setConfirming(true)}
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-bad-soft hover:text-bad focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      </div>

      <div className="flex min-h-6 flex-wrap gap-1.5">
        {s.leans.length ? s.leans.slice(0, 3).map((l) => <LeanChip key={l.symbol} {...l} />) : <span className="text-xs text-muted-foreground">No token posts this month</span>}
      </div>

      <LeanSparkline s={s} />

      {s.total !== null && s.overall && s.overall.settled + s.overall.open > 0 && (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted-foreground">
            Following their calls: <span className={`font-medium ${s.total > 0 ? "text-good" : s.total < 0 ? "text-bad" : "text-foreground"}`}>{signed(s.total / 100)}</span>
            {s.alphaTotal !== null && <> · <span title="The same calls minus what the market did over each call's 3 days">vs market <span className={`font-medium ${s.alphaTotal > 0 ? "text-good" : s.alphaTotal < 0 ? "text-bad" : "text-foreground"}`}>{signed(s.alphaTotal / 100)}</span></span></>}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <BeatMarketBadge record={s.overall} />
            {s.overall.settled > 0 && <span>{s.overall.right}/{s.overall.settled} right{s.overall.horizons[MAIN_HORIZON].benchmarked > 0 && <> · {s.overall.horizons[MAIN_HORIZON].beat}/{s.overall.horizons[MAIN_HORIZON].benchmarked} beat it</>}</span>}
          </p>
        </div>
      )}

      {/* Remove confirmation: covers the card; holding the button removes it, Cancel or Escape backs out. */}
      {confirming && (
        <div role="dialog" aria-label={`Remove ${a.handle}?`} onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirming(false); }}
          className="absolute inset-0 z-10 grid cursor-default place-content-center justify-items-center gap-3 bg-card/95 p-4 text-center backdrop-blur-sm"
          style={{ "--danger": "var(--bad)" } as CSSProperties}>
          <Avatar account={a} className="size-12 text-base" />
          <div className="grid gap-1">
            <p className="font-semibold">Remove {a.handle}?</p>
            <p className="text-xs text-muted-foreground">{sample ? "Sample profile: hidden on this browser." : "Deletes the saved Grok reading. Research the account again to bring it back."}</p>
          </div>
          <HoldToConfirm label="Hold to remove" confirmedLabel="Removed" tone="danger" duration={900} onConfirm={() => setTimeout(onRemove, 450)} autoFocus />
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">Cancel</button>
        </div>
      )}
    </article>
  );
}

/** How long the card keeps checking for the reading after the prompt is copied. */
const WAIT_MS = 10 * 60_000;

/**
 * Look up an X account. Entering a handle morphs the search bar into a copy control holding the prompt for Grok Bot;
 * after copying, the card watches for the reading to arrive and points to the new profile.
 */
function Research({ query, setQuery, accounts, onSaved }: { query: string; setQuery: (v: string) => void; accounts: Account[]; onSaved: () => void }) {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState<string | null>(null);        // handle the prompt is made for
  const [copiedAt, setCopiedAt] = useState<number | null>(null);  // when it was copied, to spot the new reading

  const handle = handleOf(query);
  const ok = validHandle(handle);
  const known = (h: string) => accounts.find((a) => a.handle.toLowerCase() === "@" + h);

  // Once copied, reload the profiles every 10s until a reading newer than the copy shows up.
  const arrived = ready && copiedAt ? (() => { const a = known(ready); return a?.analyzedAt && Date.parse(a.analyzedAt) > copiedAt ? a : null; })() : null;
  const waiting = Boolean(ready && copiedAt && !arrived);
  useEffect(() => {
    if (!waiting) return;
    const start = Date.now();
    const t = setInterval(() => { if (Date.now() - start > WAIT_MS) clearInterval(t); else onSaved(); }, 10_000);
    return () => clearInterval(t);
  }, [waiting, onSaved]);

  const go = () => { if (ok) { setReady(handle); setCopiedAt(null); } };
  const back = () => { setReady(null); setCopiedAt(null); };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, filter: `blur(${motionTokens.blur.soft}px)` },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.96, filter: `blur(${motionTokens.blur.soft}px)`, transition: { duration: motionTokens.duration.exit } },
        transition: motionTokens.spring.morph,
      };
  const existing = ready ? known(ready) : undefined;

  // The hero's ASCII backdrop. The other styles (candles, depth, tape, terrain, radar) live in ascii-backdrop.tsx;
  // swap the id here to use one, or render <BackdropPicker> from that file to flip between them.
  const backdrop = "braille" as const;

  return (
    <section className={`${card} relative isolate overflow-hidden p-0`} aria-label="Research an account" style={neutralAccent}>
      <AsciiBackdrop id={backdrop} />
      <div className="relative flex min-h-[248px] flex-col items-start justify-center gap-5 px-6 py-8">
        <div className="grid">
          <h2 className="text-3xl leading-none font-bold tracking-tight sm:text-4xl">Trade the timeline.</h2>
          <p className="mt-2.5 max-w-[40ch] text-sm text-muted-foreground">Paste an X account. Grok Bot reads its calls; X Alpha prices them against Gemini prediction markets.</p>
        </div>
      {/* Grok Bot's mark, then the same pill from the start: the search bar morphs into the copy control in place. */}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-[0.875rem] bg-foreground text-background" title="Grok Bot"><GrokBotLogo className="size-5" /></span>
        {/* Arc's own control radius (the app's chips use full pills), so the bar matches the uiarc search field. */}
        <motion.div layout={!reduce} transition={motionTokens.spring.morph} className="min-w-0 flex-1 basis-56 sm:max-w-sm"
          style={{ "--radius-control": "0.875rem" } as CSSProperties}>
          <AnimatePresence mode="popLayout" initial={false}>
            {!ready ? (
              <motion.div key="search" {...swap} className="[&_label]:sr-only">
                <SearchField label="X account to research" placeholder="@handle or x.com link" value={query} onValueChange={setQuery}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }} autoComplete="off" spellCheck={false} />
              </motion.div>
            ) : (
              <motion.div key="copy" {...swap}
                className="flex h-10 items-center justify-between gap-2 rounded-[0.875rem] border border-[var(--border-strong)] bg-card py-1 pr-1 pl-1.5">
                <button type="button" onClick={back} aria-label={`Change account (now @${ready})`}
                  className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-sm font-medium outline-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring">
                  {existing ? <Avatar account={existing} className="size-7 text-[10px]" /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs">@</span>}
                  <span className="truncate">@{ready}</span>
                  <X width={14} height={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
                <CopyButton value={promptFor(ready)} label="Copy prompt" onCopied={() => setCopiedAt(Date.now())} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* While waiting there is no message: the page keeps checking quietly and says so once the reading lands. */}
        {(arrived || (!ready && query.trim() && !ok)) && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {arrived ? <span className="text-good">Saved. @{ready} is in your profiles below.</span> : "That doesn't look like an X username."}
          </span>
        )}
      </div>
      </div>
    </section>
  );
}
