"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/account-avatar";
import { GeminiLogo, GrokBotLogo } from "@/components/brand-logos";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { CompareView } from "@/components/compare-view";
import { Confidence } from "@/components/confidence";
import { Market } from "@/components/market";
import { PriceCallsChart } from "@/components/price-calls-chart";
import { since, SourceStatus } from "@/components/source-status";
import { XAlphaLogo } from "@/components/x-alpha-logo";
import { DAY_MS, OddsState, Tag, card, cents, clock, date, geminiUrl, label, neutralAccent, pct, sideOf, signed, stamp, usd, useOdds, when, displayName } from "@/components/shared";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Ladder, Match } from "@/lib/gemini";
import { bestContract, type Pick, type PickResult } from "@/lib/pick";
import { ACCOUNTS, type Account, type Stance } from "@/lib/sample";
import { stances, TOKEN_NAMES, type TokenStance, type TokenSymbol } from "@/lib/stance";
import { HORIZON_DAYS, trackRecord, type Call, type PriceSeries, type Tally, type TokenRecord } from "@/lib/track";

export default function Page() {
  // Accounts Grok Bot has sent in come first; the invented samples stay as a fallback.
  const [fromGrok, setFromGrok] = useState<Account[]>([]);
  const [prices, setPrices] = useState<Partial<Record<TokenSymbol, PriceSeries>> | null>(null);
  const [pricesAt, setPricesAt] = useState<number | null>(null);
  // Re-renders every 30s so "x min ago" in the source cards stays current.
  // Starts empty: reading the clock during the first render breaks Next's prerender, so it is set once mounted.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/readings").then((r) => r.json()).then((b) => { if (live && Array.isArray(b.accounts)) setFromGrok(b.accounts); }).catch(() => {});
    fetch("/api/prices").then((r) => r.json()).then((b) => { if (live) { setPrices(b.prices ?? {}); setPricesAt(Date.now()); } }).catch(() => { if (live) setPrices({}); });
    return () => { live = false; };
  }, []);

  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<"account" | "compare">("account");
  const [picked, setPicked] = useState<TokenSymbol | null>(null);
  const [ladderIndex, setLadderIndex] = useState<number | null>(null);

  const accounts = [...fromGrok, ...ACCOUNTS];
  const account = accounts.find((a) => a.handle === chosen) ?? accounts[0];
  const isSample = account.source !== "grok";
  const all = stances(account);
  const symbol = picked ?? all.find((s) => s.posts > 0)?.symbol ?? "BTC";
  const stance = all.find((s) => s.symbol === symbol)!;
  const record = prices ? trackRecord(account.posts, prices) : null;
  const tokenRecord = record?.byToken.find((b) => b.token === symbol) ?? null;
  const tokenCalls = record?.calls.filter((c) => c.token === symbol) ?? [];

  // Memoised so the chart only recomputes its markers when the account or its calls change.
  const singleSource = useMemo(() => [{ account, calls: tokenCalls }], [account, tokenCalls]);
  const odds = useOdds(symbol);
  const ladders = odds.status === "ready" ? odds.ladders : [];
  const ladder = ladders.length ? ladders[ladderIndex ?? ladders.length - 1] ?? ladders[ladders.length - 1] : null; // default: longest horizon
  const side = sideOf(stance.score);
  // Best contract for this account: its named targets, conviction and track record against the live odds (lib/pick).
  const best = ladder ? bestContract({ ladder, symbol, score: stance.score, posts: account.posts, record: tokenRecord, ref: prices?.[symbol]?.at(-1)?.[1] ?? null }) : null;
  const match = best?.pick ?? null;

  const lastRun = fromGrok.length ? Math.max(...fromGrok.map((a) => Date.parse(a.analyzedAt!))) : null;
  const lastCandle = prices?.[symbol]?.at(-1)?.[0] ?? null;
  const pick = (s: TokenSymbol) => { setPicked(s); setLadderIndex(null); };

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1><XAlphaLogo className="h-8 w-auto" title="X Alpha" /></h1>
          <SegmentedControl label="View" value={mode} onValueChange={(v) => setMode(v as "account" | "compare")}
            options={[{ value: "account", label: "Account" }, { value: "compare", label: "Compare" }]} />
        </div>
        <div className="flex gap-3">
          <SourceStatus name="Grok Bot" logo={<GrokBotLogo className="size-5" />}
            state={isSample ? "sample" : "live"}
            rows={isSample ? [
              { label: "This account", value: "Invented sample, not read from X" },
              { label: "Last Grok run", value: lastRun ? `${since(lastRun, now)} · ${stamp(lastRun)}` : "No runs yet" },
            ] : [
              { label: "Last run", value: `${since(Date.parse(account.analyzedAt!), now)} · ${stamp(Date.parse(account.analyzedAt!))}` },
              { label: "This account", value: `${account.handle} · ${account.posts.length} posts` },
              { label: "Accounts read", value: fromGrok.length },
            ]} />
          <SourceStatus name="Gemini" logo={<GeminiLogo className="size-5" />}
            state={odds.status === "ready" ? (ladders.length ? "live" : "error") : odds.status === "error" ? "error" : "loading"}
            rows={[
              { label: "Odds updated", value: odds.status === "ready" ? `${since(odds.at, now)} · ${clock(odds.at)}` : odds.status === "error" ? odds.message : "Loading…" },
              { label: "Prices updated", value: pricesAt ? `${since(pricesAt, now)} · ${clock(pricesAt)}` : "Loading…" },
              { label: "Latest candle", value: lastCandle ? `Hourly · ${clock(lastCandle)}` : "–" },
              { label: `${symbol} markets`, value: ladders.length ? `${ladders.length} open · next ${new Date(ladders[0].expiry).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })}` : "None open" },
            ]} />
        </div>
      </header>

      {mode === "compare" ? (
        <CompareView key={account.handle} accounts={accounts} prices={prices} initialA={account.handle} />
      ) : (<>
      {/* Accounts Grok Bot read stay in view; the invented samples fold behind "+N more". */}
      <nav aria-label="Accounts" style={{ ...neutralAccent, "--control-height-sm": "38px", "--text-sm": "0.875rem", "--space-2": "0.625rem" } as React.CSSProperties}>
        <ChipGroup label="Account" multiple={false}
          maxVisible={fromGrok.length > 0 ? fromGrok.length : Infinity}
          value={[account.handle]}
          onValueChange={(v) => { if (v[0]) { setChosen(v[0]); setPicked(null); setLadderIndex(null); } }}
          options={accounts.map((a) => ({
            value: a.handle,
            label: (
              <span className="flex items-center gap-2">
                <Avatar account={a} className="size-[26px] text-[10px]" />
                {a.handle}
              </span>
            ),
          }))} />
      </nav>

      {/* Verdict first, then the price with every call on it, then the numbers that back it. */}
      <section className={`${card} grid gap-4`} aria-label="Verdict">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar account={account} className="size-10 text-sm" />
            <div className="min-w-0">
              <div className="truncate font-semibold" title={!isSample && account.bio ? `Grok's notes: ${account.bio}` : undefined}>{account.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {account.handle} · {isSample ? "Sample account" : `Read ${when(account.analyzedAt!)}`}
              </div>
            </div>
          </div>
          <TokenTabs all={all} symbol={symbol} onPick={pick} byToken={record?.byToken} resetKey={account.handle} />
        </div>

        <p className="text-lg leading-[1.9] text-pretty">
          <Verdict symbol={symbol} stance={stance} handle={displayName(account)} tally={tokenRecord} pricesReady={record !== null} match={match} ladder={ladder} odds={odds} series={prices?.[symbol]} reason={best?.reason} />
        </p>

        <PriceCallsChart symbol={symbol} series={prices?.[symbol]} sources={singleSource} />

        <ContractCard symbol={symbol} stance={stance} handle={displayName(account)} result={best} ladder={ladder} odds={odds} record={tokenRecord} calls={tokenCalls} />
      </section>

      <section>
        <Market symbol={symbol} odds={odds} ladders={ladders} ladder={ladder} onLadder={setLadderIndex} marks={[{ account, match }]} />
      </section>
      </>)}
      <p className="text-center text-xs text-muted-foreground">Shown for review only. X Alpha places no trades.</p>
    </main>
  );
}

/**
 * Token picker on Arc's ChipGroup. Tokens the account posted about this week come first and stay in view;
 * the quiet ones fold behind a "+N more" chip. A quiet token with older calls shows its record, e.g. "1/1".
 */
function TokenTabs({ all, symbol, onPick, byToken, resetKey }: {
  all: TokenStance[]; symbol: TokenSymbol; onPick: (s: TokenSymbol) => void; byToken: TokenRecord[] | undefined; resetKey: string;
}) {
  const active = all.filter((s) => s.posts > 0);
  const quiet = all.filter((s) => s.posts === 0)
    .map((s) => ({ s, rec: byToken?.find((b) => b.token === s.symbol) }))
    .sort((a, b) => (b.rec?.settled ?? 0) - (a.rec?.settled ?? 0))
    .map(({ s }) => s);
  const options = [...active, ...quiet].map((s) => {
    const side = sideOf(s.score);
    const rec = byToken?.find((b) => b.token === s.symbol);
    const Arrow = side === "bullish" ? ArrowUpRight : ArrowDownRight;
    return {
      value: s.symbol,
      label: (
        <span className="flex items-center gap-1.5" title={s.posts ? TOKEN_NAMES[s.symbol] : `No posts about ${s.symbol} this week`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/tokens/${s.symbol.toLowerCase()}.svg`} alt="" className={`size-4 ${s.posts ? "" : "opacity-50 grayscale"}`} />
          {s.symbol}
          {s.score !== null && (
            <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${side === "bullish" ? "text-good" : side === "bearish" ? "text-bad" : "text-muted-foreground"}`}>
              {side ? <Arrow className="size-3" strokeWidth={2.75} aria-label={side} /> : "•"}
              {Math.round(side === "bearish" ? 100 - s.score : s.score)}%
            </span>
          )}
          {s.posts === 0 && rec && rec.settled > 0 && <span className="font-mono text-[11px] text-muted-foreground">{rec.right}/{rec.settled}</span>}
        </span>
      ),
    };
  });
  return (
    // Arc tints the chosen chip with --accent; point it at the text colour here so it reads like the app's other selections.
    <div style={neutralAccent}>
      <ChipGroup key={resetKey} label="Token" multiple={false} maxVisible={Math.max(1, active.length)} options={options}
        value={[symbol]} onValueChange={(v) => { if (v[0]) onPick(v[0] as TokenSymbol); }} />
    </div>
  );
}


/**
 * The whole read in one sentence: the lean, the token at its live price, whether past calls held up,
 * and the Gemini contract on that side. Every number is a tag; the token tag carries its icon.
 */
function Verdict({ symbol, stance, handle, tally, pricesReady, match, ladder, odds, series, reason }: {
  symbol: TokenSymbol; stance: TokenStance; handle: string; tally: Tally | null; pricesReady: boolean;
  match: Pick | null; ladder: Ladder | null; odds: OddsState; series: PriceSeries | undefined; reason?: string;
}) {
  const now = series?.at(-1);
  const weekAgo = now && series ? [...series].reverse().find(([t]) => t <= now[0] - 7 * DAY_MS) : undefined;
  const week = now && weekAgo ? now[1] / weekAgo[1] - 1 : null;
  const token = (
    <Tag title={`${TOKEN_NAMES[symbol]}${week !== null ? `, ${signed(week)} over 7 days` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt="" className="size-[1.05em]" />
      {symbol}
      {now && <span className="font-normal text-muted-foreground">{usd(now[1] >= 1000 ? Math.round(now[1]) : now[1])}</span>}
      {week !== null && <span className="font-normal text-muted-foreground">{signed(week)}</span>}
    </Tag>
  );

  if (stance.score === null) return <>{handle} hasn&apos;t posted about {token} this week.</>;
  const score = Math.round(stance.score);
  const side = sideOf(stance.score);
  const Arrow = side === "bullish" ? ArrowUpRight : ArrowDownRight;
  const lean = side
    ? <Tag tone={side === "bullish" ? "good" : "bad"}><Arrow className="size-[1em]" strokeWidth={2.75} aria-hidden="true" />{side === "bearish" ? 100 - score : score}% {side}</Tag>
    : <Tag>mixed · {score}% bullish</Tag>;


  const market = !side ? <> No clear lean, so there&apos;s no contract to match.</>
    : odds.status === "loading" ? <> Checking Gemini&apos;s odds…</>
    : odds.status === "error" ? <> Gemini&apos;s prediction markets aren&apos;t responding right now, so there&apos;s no bet to show.</>
    : !match || !ladder ? <> {reason ?? "Gemini has no live contract on that side right now."}</>
    : <> Gemini gives a <Tag>{pct(match.marketChance)} chance</Tag> it ends {match.side === "yes" ? "at or above" : "below"}{" "}
        <Tag>{usd(match.rung.strike)}</Tag> by {date(ladder.expiry)}; their posts put it near <Tag>{pct(match.accountChance)}</Tag>, so the best bet is{" "}
        <Tag tone={match.side === "yes" ? "good" : "bad"}>{match.side === "yes" ? "Yes" : "No"} · {cents(match.price)}</Tag>.</>;

  return <>{handle} is {lean} on {token} this week.{market}</>;
}


/**
 * The best Gemini contract for the account's view (lib/pick): what it costs and pays, the account's odds next to
 * the market's, the price levels from its posts that drove the pick, and the runner-ups.
 */
function ContractCard({ symbol, stance, handle, result, ladder, odds, record, calls }: {
  symbol: TokenSymbol; stance: TokenStance; handle: string; result: PickResult | null; ladder: Ladder | null; odds: OddsState;
  record: Tally | null; calls: Call[];
}) {
  const side = sideOf(stance.score);
  const match = result?.pick ?? null;
  const head = (
    <div className="flex items-center justify-between gap-2">
      <div className={label}>Best contract</div>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-neutral-950 text-white"><GeminiLogo className="size-3" /></span>Gemini
      </span>
    </div>
  );
  if (!match || !ladder || !side) {
    return (
      <div className="grid content-start gap-1 rounded-lg p-3 ring-1 ring-foreground/10 sm:col-span-2 lg:col-span-1">
        {head}
        <div className="mt-1 text-2xl font-semibold">–</div>
        <div className="text-xs text-muted-foreground">
          {!side ? "No clear lean to match." : odds.status === "loading" ? "Checking Gemini's odds…" : odds.status === "error" ? "Gemini's prediction markets aren't responding right now. Try again in a minute." : result?.reason ?? `No live ${symbol} contract on that side right now.`}
        </div>
        {/* Shown here too: low confidence is often why there's no pick. */}
        {side && <div className="mt-2"><Confidence record={record} calls={calls} symbol={symbol} /></div>}
      </div>
    );
  }
  const yes = match.side === "yes";
  const tone = yes ? "bg-good" : "bg-bad";
  const odd = (name: string, value: number, fill: string) => (
    <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{name}</span>
      <span className="h-1.5 rounded-full bg-foreground/[0.07]"><span className={`block h-1.5 rounded-full ${fill}`} style={{ width: pct(value) }} /></span>
      <span className="text-right font-mono tabular-nums">{pct(value)}</span>
    </div>
  );
  return (
    <div className="grid gap-3 rounded-lg p-4 ring-1 ring-foreground/10">
      {head}
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      <div className="grid content-start gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${yes ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{yes ? "Yes" : "No"}</span>
          <span className="text-2xl font-semibold tabular-nums">{cents(match.price)}</span>
        </div>
        <span className="text-xs text-muted-foreground">pays $1 if right · <span className="font-medium text-foreground">{(1 / match.price).toFixed(1)}×</span></span>
      </div>
      <div className="text-sm leading-snug">
        <span className="font-medium">{symbol} {match.rung.label}</span>
        <span className="text-muted-foreground"> · settles {when(ladder.expiry)}</span>
      </div>

      <Confidence record={record} calls={calls} symbol={symbol} />
      </div>

      <div className="grid content-start gap-3">
      <div className="grid gap-1.5">
        {odd(handle.length > 12 ? "Their view" : handle, match.accountChance, tone)}
        {odd("Market", match.marketChance, "bg-foreground/40")}
        <div className="text-xs text-muted-foreground">
          Edge <span className="font-medium text-foreground tabular-nums">+{Math.round(match.edge * 100)}¢</span> per $1
        </div>
      </div>

      <div className="truncate border-t border-foreground/[0.07] pt-2.5 text-xs text-muted-foreground">
        {match.target
          ? <>Based on <a href={match.target.url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">{usd(match.target.price)}</a> <span className="italic">&ldquo;{match.target.quote}&rdquo;</span></>
          : "No price level named; uses the lean and their typical move."}
      </div>
      </div>
      </div>

      <a href={geminiUrl(ladder)} target="_blank" rel="noreferrer"
        className="flex items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
        Trade on Gemini ↗
      </a>
    </div>
  );
}





