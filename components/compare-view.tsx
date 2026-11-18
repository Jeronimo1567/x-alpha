"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { GeminiLogo } from "@/components/brand-logos";
import { AsciiBackdrop } from "@/components/ascii-backdrop";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { ConfidenceMeter, confidenceLevel } from "@/components/confidence";
import { Market } from "@/components/market";
import { PriceCallsChart } from "@/components/price-calls-chart";
import { card, cents, displayName, geminiUrl, label, neutralAccent, pct, shortWhen, sideOf, signed, Tag, usd, useOdds } from "@/components/shared";
import type { Ladder, Match } from "@/lib/gemini";
import { bestContract, credibilityOf, type PickResult } from "@/lib/pick";
import type { Account } from "@/lib/sample";
import { stances, TOKEN_NAMES, TOKENS, type TokenStance, type TokenSymbol } from "@/lib/stance";
import { trackRecord, type Call, type PriceSeries, type TokenRecord } from "@/lib/track";

/** Account chips are taller so the profile picture fits, same as the account row in the single view. */
const accountChips = { ...neutralAccent, "--control-height-sm": "38px", "--text-sm": "0.875rem", "--space-2": "0.625rem" } as CSSProperties;

type Side = {
  account: Account; stance: TokenStance; side: "bullish" | "bearish" | null;
  record: TokenRecord | null; calls: Call[]; match: Match | null; picked: PickResult | null;
};

/** Better record on this token: higher hit rate, then higher average gain. Null when neither has a judged call or they tie. */
function leader(a: Side, b: Side): 0 | 1 | null {
  const score = (s: Side) => (s.record && s.record.settled > 0 ? [s.record.right / s.record.settled, s.record.avgGain ?? 0] : null);
  const sa = score(a), sb = score(b);
  if (!sa && !sb) return null;
  if (!sb) return 0;
  if (!sa) return 1;
  if (sa[0] !== sb[0]) return sa[0] > sb[0] ? 0 : 1;
  if (sa[1] !== sb[1]) return sa[1] > sb[1] ? 0 : 1;
  return null;
}

function Lean({ s }: { s: Side }) {
  if (s.stance.score === null) return <Tag>no posts</Tag>;
  const score = Math.round(s.stance.score);
  if (!s.side) return <Tag>mixed · {score}% bullish</Tag>;
  const Arrow = s.side === "bullish" ? ArrowUpRight : ArrowDownRight;
  return (
    <Tag tone={s.side === "bullish" ? "good" : "bad"}>
      <Arrow className="size-[1em]" strokeWidth={2.75} aria-hidden="true" />{s.side === "bearish" ? 100 - score : score}% {s.side}
    </Tag>
  );
}

/**
 * Two accounts side by side on one token: their leans, their track records, both sets of calls on one price
 * line, and the Gemini contract each lean points to, on a shared settle date.
 */
export function CompareView({ accounts, prices, initialA, initialB }: { accounts: Account[]; prices: Partial<Record<TokenSymbol, PriceSeries>> | null; initialA: string; initialB?: string }) {
  const [aHandle, setA] = useState(initialA);
  const [bHandle, setB] = useState(() => (initialB && initialB !== initialA ? initialB : accounts.find((x) => x.handle !== initialA)?.handle ?? initialA));
  const a = accounts.find((x) => x.handle === aHandle) ?? accounts[0];
  const b = accounts.find((x) => x.handle === bHandle && x.handle !== a.handle) ?? accounts.find((x) => x.handle !== a.handle) ?? a;

  const sa = stances(a), sb = stances(b);
  const posted = (list: TokenStance[], t: TokenSymbol) => list.find((s) => s.symbol === t)!.posts > 0;
  // Default to a token both talked about, then one either did.
  const fallback = TOKENS.find((t) => posted(sa, t) && posted(sb, t)) ?? TOKENS.find((t) => posted(sa, t) || posted(sb, t)) ?? "BTC";
  const [picked, setPicked] = useState<TokenSymbol | null>(null);
  const symbol = picked ?? fallback;

  const odds = useOdds(symbol);
  const ladders = odds.status === "ready" ? odds.ladders : [];
  const [ladderIndex, setLadderIndex] = useState<number | null>(null);
  const ladder: Ladder | null = ladders.length ? ladders[ladderIndex ?? ladders.length - 1] ?? ladders[ladders.length - 1] : null;

  const sides: [Side, Side] = [a, b].map((account, n) => {
    const stance = (n === 0 ? sa : sb).find((s) => s.symbol === symbol)!;
    const record = prices ? trackRecord(account.posts, prices) : null;
    const side = sideOf(stance.score);
    const tokenRecord = record?.byToken.find((t) => t.token === symbol) ?? null;
    const picked = ladder ? bestContract({ ladder, symbol, score: stance.score, posts: account.posts, record: tokenRecord, ref: prices?.[symbol]?.at(-1)?.[1] ?? null }) : null;
    return {
      account, stance, side, record: tokenRecord, picked,
      calls: record?.calls.filter((c) => c.token === symbol) ?? [],
      match: picked?.pick ?? null,
    };
  }) as [Side, Side];
  const lead = leader(...sides);
  const [A, B] = sides;
  const agree = A.side && B.side ? A.side === B.side : null;

  const accountOptions = (exclude: string) => accounts.filter((x) => x.handle !== exclude).map((x) => ({
    value: x.handle,
    label: <span className="flex items-center gap-2"><Avatar account={x} className="size-[26px] text-[10px]" />{x.handle}</span>,
  }));
  const reset = () => { setPicked(null); setLadderIndex(null); };

  const token = (
    <Tag title={TOKEN_NAMES[symbol]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt="" className="size-[1.05em]" />
      {symbol}
      {prices?.[symbol]?.at(-1) && <span className="font-normal text-muted-foreground">{usd(prices[symbol]!.at(-1)![1] >= 1000 ? Math.round(prices[symbol]!.at(-1)![1]) : prices[symbol]!.at(-1)![1])}</span>}
    </Tag>
  );
  const record = (s: Side) => s.record && s.record.settled > 0
    ? <><Tag>{s.record.right}/{s.record.settled} right</Tag> ({signed(s.record.avgGain!)} each)</>
    : <span className="text-muted-foreground">no judged calls yet</span>;

  return (
    <>
      {/* Who is compared: chosen first, above the face-off. Only shown when there are other accounts to pick. */}
      {accounts.length > 2 && (
        <section className={`${card} grid gap-3 md:grid-cols-2`} aria-label="Choose accounts">
          {([["First account", accountOptions(b.handle), a.handle, setA], ["Second account", accountOptions(a.handle), b.handle, setB]] as const).map(([which, options, value, set]) => (
            <div key={which} style={accountChips} className="grid gap-1.5">
              <span className={label}>{which}</span>
              <ChipGroup label={which} multiple={false} options={options} value={[value]}
                onValueChange={(v) => { if (v[0]) { set(v[0]); reset(); } }} />
            </div>
          ))}
        </section>
      )}

      {/* Face-off hero: the same box as the dashboard hero, with a still field of dotted lines fanning out from the VS, with both people on top of it. */}
      <section className={`${card} relative isolate overflow-hidden p-0`} aria-label="Face-off">
        <AsciiBackdrop id="depth" />
        <div className="relative grid min-h-[248px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-5 sm:gap-6">
          {[A, B].map((s, n) => (
            <div key={s.account.handle} className={`grid justify-items-center gap-2.5 text-center ${n === 1 ? "col-start-3" : ""}`}>
              <Avatar account={s.account} className="size-20 text-2xl ring-2 ring-foreground/10 sm:size-24 sm:text-3xl" />
              {/* Frosted so the moving line behind never runs through the name. */}
              <div className="grid min-w-0 justify-items-center gap-2 rounded-xl bg-card/70 px-4 py-2 backdrop-blur-sm">
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-lg font-semibold">{displayName(s.account)}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.account.handle}</span>
                </div>
                <div className="grid justify-items-center gap-1">
                  <span className={label}>Position on {symbol}</span>
                  <span className="text-base"><Lean s={s} /></span>
                </div>
              </div>
            </div>
          ))}
          {/* VS: green-to-red like the walls behind it (bids left, asks right), a faint diagonal slash and a soft glow.
              Both layers share the same padding: room for the italic overhang, so the S isn't clipped and the glow lines up. */}
          <div className="col-start-2 row-start-1 grid select-none justify-items-center" aria-label="versus">
            <div className="vs-mark relative grid place-items-center">
              <span aria-hidden="true" className="absolute h-24 w-px rotate-[22deg] bg-linear-to-b from-transparent via-foreground/25 to-transparent sm:h-28" />
              <span aria-hidden="true" className="absolute opacity-(--vs-glow)">
                <span className="block bg-linear-to-r from-(--vs-a) to-(--vs-b) bg-clip-text py-1 pr-4 pl-2 text-4xl font-black tracking-tighter text-transparent italic blur-xl sm:text-6xl">VS</span>
              </span>
              <span aria-hidden="true" className="relative bg-linear-to-r from-(--vs-a) via-(--vs-mid) to-(--vs-b) bg-clip-text py-1 pr-4 pl-2 text-4xl font-black tracking-tighter text-transparent italic sm:text-6xl">VS</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${card} grid gap-5`} aria-label="Compare accounts">
        <div className="flex flex-wrap items-center gap-3">
          <TokenMenu value={symbol} onPick={(t) => { setPicked(t); setLadderIndex(null); }}
            people={[displayName(a), displayName(b)]}
            counts={TOKENS.map((t) => [t, sa.find((x) => x.symbol === t)!.posts, sb.find((x) => x.symbol === t)!.posts] as const)} />
        </div>

        {/* Both sets of calls on one price line first; the read and the contracts follow. */}
        <PriceCallsChart symbol={symbol} series={prices?.[symbol]} sources={sides.map((s) => ({ account: s.account, calls: s.calls }))} />

        <p className="text-lg leading-[1.9] text-pretty">
          {A.stance.score !== null && B.stance.score !== null
            ? <>{displayName(A.account)} is <Lean s={A} /> and {displayName(B.account)} is <Lean s={B} /> on {token} this week.</>
            : A.stance.score === null && B.stance.score === null
              ? <>Neither {displayName(A.account)} nor {displayName(B.account)} posted about {token} this week.</>
              : (() => { const [has, not] = A.stance.score !== null ? [A, B] : [B, A]; return <>{displayName(has.account)} is <Lean s={has} /> on {token} this week; {displayName(not.account)} hasn&apos;t posted about it.</>; })()}
          {agree === false && <b className="font-semibold"> They disagree.</b>}
          {agree === true && <b className="font-semibold"> They agree.</b>}
          {" "}On {symbol}, {displayName(A.account)} has been {record(A)}; {displayName(B.account)} has been {record(B)}.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((s, n) => <SidePanel key={s.account.handle} s={s} symbol={symbol} ladder={ladder} leads={lead === n} loading={odds.status === "loading"} unavailable={odds.status === "error"} />)}
        </div>
      </section>

      <Market symbol={symbol} odds={odds} ladders={ladders} ladder={ladder} onLadder={setLadderIndex} marks={sides.map((s) => ({ account: s.account, match: s.match }))} />
    </>
  );
}

/** One account's numbers on the token, and the Gemini contract its lean points to. */
function SidePanel({ s, symbol, ladder, leads, loading, unavailable }: { s: Side; symbol: TokenSymbol; ladder: Ladder | null; leads: boolean; loading: boolean; unavailable: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Lean this week", <Lean key="l" s={s} />],
    ["Posts this week", s.stance.posts],
    [`${symbol} calls right`, s.record && s.record.settled > 0 ? `${s.record.right}/${s.record.settled}` : "–"],
    ["Avg gain per call", s.record?.avgGain != null ? signed(s.record.avgGain) : "–"],
    ["Confidence", <span key="c" className="flex items-center gap-2" title="How much their view counts against the market's, from past calls on this token"><ConfidenceMeter value={credibilityOf(s.record)} />{confidenceLevel(credibilityOf(s.record))} · {Math.round(credibilityOf(s.record) * 100)}%</span>],
  ];
  const m = s.picked?.pick ?? null;
  return (
    <div className="grid content-start gap-3 rounded-lg p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <Avatar account={s.account} className="size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{s.account.name}</div>
          <div className="truncate text-xs text-muted-foreground">{s.account.handle}</div>
        </div>
        {leads && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium">Better record</span>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="flex items-center justify-end font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 border-t border-foreground/[0.07] pt-3">
        <div className={label}>Best contract</div>
        {m && ladder ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${m.side === "yes" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{m.side === "yes" ? "Yes" : "No"}</span>
                <span className="text-xl font-semibold tabular-nums">{cents(m.price)}</span>
              </div>
              <span className="text-xs text-muted-foreground">pays $1 · <span className="font-medium text-foreground">{(1 / m.price).toFixed(1)}×</span></span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{symbol} {m.rung.label}</span> · {shortWhen(ladder.expiry)}
              {" "}· their odds <span className="font-medium text-foreground">{pct(m.accountChance)}</span> vs market {pct(m.marketChance)}
            </div>
            <div className="truncate text-xs text-muted-foreground" title={m.target?.quote}>
              {m.target
                ? <>Based on <span className="font-medium text-foreground">{usd(m.target.price)}</span> <span className="italic">&ldquo;{m.target.quote}&rdquo;</span></>
                : "No price level named; uses the lean and typical move."}
            </div>
            {/* Solid call to action naming the exact bet, with Gemini's mark; lifts slightly on hover. */}
            <a href={geminiUrl(ladder)} target="_blank" rel="noreferrer"
              className="group mt-1 flex h-10 items-center justify-center gap-2 rounded-[12px] bg-foreground px-4 text-sm font-semibold text-background shadow-sm outline-none transition hover:-translate-y-px hover:shadow-md hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0">
              <span className="grid size-5 place-items-center rounded-full bg-background text-foreground"><GeminiLogo className="size-3" /></span>
              Buy {m.side === "yes" ? "Yes" : "No"} at {cents(m.price)} on Gemini
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.25} aria-hidden="true" />
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {!s.side ? "No clear lean to match." : loading ? "Checking Gemini's odds…" : unavailable ? "Gemini's prediction markets aren't responding right now." : s.picked?.reason ?? `No live ${symbol} contract on that side.`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One button for the coin being compared. It opens a list of every coin with how many posts each person made about
 * it this week, so you can see before picking whether there is anything to compare.
 */
function TokenMenu({ value, onPick, people, counts }: {
  value: TokenSymbol; onPick: (t: TokenSymbol) => void; people: [string, string];
  counts: (readonly [TokenSymbol, number, number])[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const icon = (t: TokenSymbol, dim = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/tokens/${t.toLowerCase()}.svg`} alt="" className={`size-4 shrink-0 ${dim ? "opacity-50 grayscale" : ""}`} />
  );
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        {icon(value)}{value}<span className="font-normal text-muted-foreground">{TOKEN_NAMES[value]}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label="Coin to compare"
          className="absolute top-full left-0 z-30 mt-2 grid w-[22rem] max-w-[calc(100vw-48px)] gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-[var(--shadow-floating)]">
          {counts.map(([t, na, nb]) => {
            const none = na === 0 && nb === 0;
            const who = (name: string, n: number) => <span className={n ? "text-foreground" : ""}>{name} {n || "–"}</span>;
            return (
              <button key={t} type="button" role="option" aria-selected={t === value} onClick={() => { onPick(t); setOpen(false); }}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted ${t === value ? "bg-muted" : ""}`}>
                {icon(t, none)}
                <span className={`grid min-w-0 flex-1 ${none ? "text-muted-foreground" : ""}`}>
                  <span className="font-medium">{t} <span className="font-normal text-muted-foreground">{TOKEN_NAMES[t]}</span></span>
                  <span className="truncate text-xs text-muted-foreground">
                    {none ? "Neither posted about it this week" : <>Posts this week: {who(people[0], na)} · {who(people[1], nb)}</>}
                  </span>
                </span>
                {t === value && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
