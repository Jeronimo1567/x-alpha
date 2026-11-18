"use client";

import { useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { AsciiBackdrop } from "@/components/ascii-backdrop";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { ConfidenceMeter } from "@/components/confidence";
import { Market } from "@/components/market";
import { PriceCallsChart } from "@/components/price-calls-chart";
import { ContractTicket, ContractTicketEmpty, OtherMarkets, SourceTweet, type OtherMarket } from "@/components/contract-ticket";
import { card, cents, displayName, label, neutralAccent, pct, shortWhen, sideOf, signed, Tag, usd, useOdds } from "@/components/shared";
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
  /** When the chosen market has no pick: other dates on this coin where their view still has an edge. */
  others: OtherMarket[];
  /** Other coins they lean clearly on this week. */
  leaning: TokenSymbol[];
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
  // Coins either account posted about most this week come first; ties keep the usual order.
  const postCount = (t: TokenSymbol) => sa.find((s) => s.symbol === t)!.posts + sb.find((s) => s.symbol === t)!.posts;
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
    const pickOn = (l: Ladder) => bestContract({ ladder: l, symbol, score: stance.score, posts: account.posts, record: tokenRecord, ref: prices?.[symbol]?.at(-1)?.[1] ?? null });
    const picked = ladder ? pickOn(ladder) : null;
    const others = picked && !picked.pick && side
      ? ladders.flatMap((l, index) => { if (l === ladder) return []; const p = pickOn(l).pick; return p ? [{ index, ladder: l, pick: p }] : []; })
      : [];
    const leaning = (n === 0 ? sa : sb).filter((t) => t.symbol !== symbol && sideOf(t.score)).map((t) => t.symbol);
    return {
      account, stance, side, record: tokenRecord, picked, others, leaning,
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
          {/* VS: minimal. Small muted letters between two hairlines. */}
          <div className="col-start-2 row-start-1 grid select-none justify-items-center gap-2" aria-label="versus">
            <span aria-hidden="true" className="h-8 w-px bg-linear-to-b from-transparent to-foreground/20" />
            <span aria-hidden="true" className="font-mono text-xs tracking-[0.3em] text-muted-foreground uppercase">vs</span>
            <span aria-hidden="true" className="h-8 w-px bg-linear-to-t from-transparent to-foreground/20" />
          </div>
        </div>
      </section>

      <section className={`${card} grid gap-5`} aria-label="Compare accounts">
        {/* Both sets of calls on one price line first; the read and the contracts follow. */}
        <PriceCallsChart symbol={symbol} series={prices?.[symbol]} sources={sides.map((s) => ({ account: s.account, calls: s.calls }))}
          toolbar={
            <div style={neutralAccent}>
              <ChipGroup label="Coin" multiple={false} value={[symbol]} onValueChange={(v) => { if (v[0]) { setPicked(v[0] as TokenSymbol); setLadderIndex(null); } }}
                options={[...TOKENS].sort((x, y) => postCount(y) - postCount(x)).map((t) => {
                  const any = posted(sa, t) || posted(sb, t);
                  return {
                    value: t,
                    label: (
                      <span className="flex items-center gap-1.5" title={any ? TOKEN_NAMES[t] : `Neither posted about ${t} this week`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/tokens/${t.toLowerCase()}.svg`} alt="" className={`size-4 ${any ? "" : "opacity-50 grayscale"}`} />
                        {t}
                      </span>
                    ),
                  };
                })} />
            </div>
          } />

        <Summary A={A} B={B} symbol={symbol} />

        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((s, n) => <SidePanel key={s.account.handle} s={s} symbol={symbol} ladder={ladder} leads={lead === n} loading={odds.status === "loading"} unavailable={odds.status === "error"} current={prices?.[symbol]?.at(-1)?.[1] ?? null}
            onLadder={setLadderIndex} onCoin={(t) => { setPicked(t); setLadderIndex(null); }} />)}
        </div>
      </section>

      <Market symbol={symbol} odds={odds} ladders={ladders} ladder={ladder} onLadder={setLadderIndex} marks={sides.map((s) => ({ account: s.account, match: s.match }))} />
    </>
  );
}

/** The lean as one coloured word: bearish / bullish / mixed. */
function LeanWord({ s }: { s: Side }) {
  if (!s.side) return <b className="font-semibold">mixed</b>;
  return <b className={`font-semibold ${s.side === "bullish" ? "text-good" : "text-bad"}`}>{s.side}</b>;
}

/** One quiet sentence: where each stands this week, then their record on the token, muted. No pills. */
function Summary({ A, B, symbol }: { A: Side; B: Side; symbol: TokenSymbol }) {
  const na = displayName(A.account), nb = displayName(B.account);
  const hasA = A.stance.score !== null, hasB = B.stance.score !== null;
  const lean = hasA && hasB
    ? A.side && A.side === B.side
      ? <>{na} and {nb} are both <LeanWord s={A} /> on {symbol} this week.</>
      : <>{na} is <LeanWord s={A} /> and {nb} is <LeanWord s={B} /> on {symbol} this week.</>
    : hasA || hasB
      ? (() => { const [has, not] = hasA ? [A, B] : [B, A]; return <>{displayName(has.account)} is <LeanWord s={has} /> on {symbol} this week; {displayName(not.account)} hasn&apos;t posted about it.</>; })()
      : <>Neither {na} nor {nb} posted about {symbol} this week.</>;
  const rec = (s: Side) => (s.record && s.record.settled > 0 ? `${s.record.right}/${s.record.settled}` : null);
  const ra = rec(A), rb = rec(B);
  const record = ra && rb ? `${na} is ${ra} on ${symbol} calls, ${nb} ${rb}.`
    : ra || rb ? `${ra ? na : nb} is ${ra ?? rb} on ${symbol} calls; ${ra ? nb : na} has none judged yet.`
    : null;
  return (
    <p className="text-lg leading-relaxed text-pretty">
      {lean}{record && <span className="text-muted-foreground"> {record}</span>}
    </p>
  );
}

/** One account's numbers on the token, and the Gemini contract its lean points to. */
function SidePanel({ s, symbol, ladder, leads, loading, unavailable, current, onLadder, onCoin }: {
  s: Side; symbol: TokenSymbol; ladder: Ladder | null; leads: boolean; loading: boolean; unavailable: boolean; current: number | null;
  onLadder: (i: number) => void; onCoin: (t: TokenSymbol) => void;
}) {
  const live = !loading && !unavailable;
  // Lean is already in the face-off and the record in the sentence above, so this is just three numbers.
  const cred = credibilityOf(s.record);
  const stats: [string, React.ReactNode, string?][] = [
    ["Right on " + symbol, s.record && s.record.settled > 0 ? `${s.record.right}/${s.record.settled}` : "–"],
    ["Avg per call", s.record?.avgGain != null ? signed(s.record.avgGain) : "–", s.record?.avgGain != null ? (s.record.avgGain > 0 ? "text-good" : s.record.avgGain < 0 ? "text-bad" : "") : ""],
    ["Confidence", <span key="c" className="flex items-center gap-1.5" title="How much their view counts against the market's, from past calls on this token"><ConfidenceMeter value={cred} />{Math.round(cred * 100)}%</span>],
  ];
  const m = s.picked?.pick ?? null;
  return (
    <div className="grid content-start gap-3 rounded-lg p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <Avatar account={s.account} className="size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{s.account.name}</div>
          <div className="truncate text-xs text-muted-foreground">{s.account.handle} · {s.stance.posts} {s.stance.posts === 1 ? "post" : "posts"} on {symbol} this week</div>
        </div>
        {leads && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium">Better record</span>}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {stats.map(([k, v, tone]) => (
          <div key={k} className="grid gap-0.5 rounded-lg bg-foreground/[0.04] px-3 py-2">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className={`flex items-center text-base font-semibold tabular-nums ${tone ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 border-t border-foreground/[0.07] pt-3">
        <div className={label}>Best contract</div>
        {m && ladder ? (
          <>
            <ContractTicket symbol={symbol} ladder={ladder} side={m.side} rung={m.rung} price={m.price} current={current} live={live}
              cta={`Buy ${m.side === "yes" ? "Yes" : "No"} at ${cents(m.price)} on Gemini`} />
            <div className="text-xs text-muted-foreground">
              Their odds <span className="font-medium text-foreground">{pct(m.accountChance)}</span> vs market {pct(m.marketChance)}
            </div>
            <SourceTweet account={s.account} pick={m} symbol={symbol} />
          </>
        ) : (
          <ContractTicketEmpty
            title={!s.side ? "No side to take" : loading ? "Checking Gemini's odds…" : unavailable ? "Gemini isn't responding" : s.picked?.reason?.startsWith("The market already") ? "Already priced in" : `No ${symbol} contract`}
            body={!s.side ? (s.stance.score === null ? `No ${symbol} posts this week.` : `Their ${symbol} posts are split.`) : loading ? "One moment." : unavailable ? "Try again in a minute." : s.picked?.reason?.startsWith("The market already") ? `Gemini's odds already match their view on this date, so no contract has an edge.` : s.picked?.reason ?? `No live ${symbol} contract on that side.`}>
            {!loading && !unavailable && <OtherMarkets others={s.others} leaning={s.leaning} onLadder={onLadder} onCoin={onCoin} />}
          </ContractTicketEmpty>
        )}
      </div>
    </div>
  );
}

