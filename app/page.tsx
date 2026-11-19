"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/account-avatar";
import { GeminiLogo, GrokBotLogo, QuickNodeMark } from "@/components/brand-logos";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { CompareTable } from "@/components/compare-table";
import { CompareView } from "@/components/compare-view";
import { Dashboard } from "@/components/dashboard";
import { AccountOnchain } from "@/components/onchain";
import { Confidence, ConfidenceBadge } from "@/components/confidence";
import { Market } from "@/components/market";
import { PriceCallsChart } from "@/components/price-calls-chart";
import { ContractTicket, ContractTicketEmpty, OtherMarkets, SourceTweet, type OtherMarket } from "@/components/contract-ticket";
import { since, SourceStatus } from "@/components/source-status";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { XAlphaLogo } from "@/components/x-alpha-logo";
import { DAY_MS, OddsState, card, cents, clock, date, label, neutralAccent, pct, sideOf, signed, stamp, usd, useOdds, useStreams, when, displayName } from "@/components/shared";

import type { Ladder, Match } from "@/lib/gemini";
import { bestContract, type Pick, type PickResult } from "@/lib/pick";
import { ACCOUNTS, type Account, type Stance } from "@/lib/sample";
import { stances, TOKEN_NAMES, type TokenStance, type TokenSymbol } from "@/lib/stance";
import { HORIZON_DAYS, trackRecord, type Call, type PriceSeries, type Tally, type TokenRecord } from "@/lib/track";

const HIDDEN_KEY = "x-alpha-hidden-samples";
/** The Streams count as live while a real swap has arrived this recently. Large swaps on Ethereum come every few minutes. */
const STREAMS_FRESH_MS = 30 * 60_000;

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
  const loadReadings = useCallback(() =>
    fetch("/api/readings").then((r) => r.json()).then((b) => { if (Array.isArray(b.accounts)) setFromGrok(b.accounts); }).catch(() => {}), []);
  const loadPrices = useCallback(() =>
    fetch("/api/prices").then((r) => r.json()).then((b) => { setPrices(b.prices ?? {}); setPricesAt(Date.now()); }).catch(() => setPrices((p) => p ?? {})), []);
  useEffect(() => {
    const t = setTimeout(() => { loadReadings(); loadPrices(); }, 0);
    return () => clearTimeout(t);
  }, [loadReadings, loadPrices]);
  // The header's Gemini refresh bumps this to fetch the odds again.
  const [oddsNonce, setOddsNonce] = useState(0);
  const [streams, reloadStreams] = useStreams();

  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<"dashboard" | "account" | "compare">("dashboard");
  // Profiles ticked on the dashboard, and the two of them in the head-to-head. Null: compare across every account.
  const [compareSet, setCompareSet] = useState<string[] | null>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [picked, setPicked] = useState<TokenSymbol | null>(null);
  const [ladderIndex, setLadderIndex] = useState<number | null>(null);

  // Sample accounts live in code, so "removing" one hides it in this browser. Saved readings are deleted for real.
  const [hiddenSamples, setHiddenSamples] = useState<string[]>([]);
  useEffect(() => {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"); } catch { /* storage blocked */ }
    const t = setTimeout(() => setHiddenSamples(Array.isArray(saved) ? saved : []), 0);
    return () => clearTimeout(t);
  }, []);
  const removeAccount = useCallback(async (handle: string) => {
    if (fromGrok.some((a) => a.handle === handle)) {
      setFromGrok((cur) => cur.filter((a) => a.handle !== handle));
      await fetch(`/api/readings?handle=${encodeURIComponent(handle.replace(/^@/, ""))}`, { method: "DELETE" }).catch(() => {});
      loadReadings();
    } else {
      setHiddenSamples((cur) => {
        const next = [...new Set([...cur, handle])];
        try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
        return next;
      });
    }
  }, [fromGrok, loadReadings]);

  const listed = [...fromGrok, ...ACCOUNTS.filter((a) => !hiddenSamples.includes(a.handle))];
  // Never empty: the other views need at least one account, so the samples come back if everything was removed.
  const accounts = listed.length ? listed : ACCOUNTS;
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
  const odds = useOdds(symbol, oddsNonce);
  const ladders = odds.status === "ready" ? odds.ladders : [];
  const ladder = ladders.length ? ladders[ladderIndex ?? ladders.length - 1] ?? ladders[ladders.length - 1] : null; // default: longest horizon
  const side = sideOf(stance.score);
  // Best contract for this account: its named targets, conviction and track record against the live odds (lib/pick).
  const pickOn = (l: Ladder) => bestContract({ ladder: l, symbol, score: stance.score, posts: account.posts, record: tokenRecord, ref: prices?.[symbol]?.at(-1)?.[1] ?? null });
  const best = ladder ? pickOn(ladder) : null;
  // No pick on the chosen date: other dates on this coin where their view still has an edge.
  const otherMarkets: OtherMarket[] = best && !best.pick && sideOf(stance.score)
    ? ladders.flatMap((l, index) => { if (l === ladder) return []; const p = pickOn(l).pick; return p ? [{ index, ladder: l, pick: p }] : []; })
    : [];
  const match = best?.pick ?? null;

  const lastRun = fromGrok.length ? Math.max(...fromGrok.map((a) => Date.parse(a.analyzedAt!))) : null;
  const lastCandle = prices?.[symbol]?.at(-1)?.[0] ?? null;
  const pick = (s: TokenSymbol) => { setPicked(s); setLadderIndex(null); };

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1>
            {/* The logo goes home: back to the dashboard from any view. */}
            <button type="button" onClick={() => setMode("dashboard")} aria-label="X Alpha, go to dashboard"
              className="block rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring">
              <XAlphaLogo className="h-8 w-auto" title="X Alpha" />
            </button>
          </h1>
          {/* No frame around the tabs; only the chosen tab gets a box, the same as the theme toggle (38px, 12px corners,
              card background, hairline border). Arc rounds the tab 4px less than --radius-control, hence 16px. */}
          <span className="flex" style={{ "--radius-control": "16px", "--control-height-sm": "38px", "--surface": "var(--card)" } as React.CSSProperties}>
            <SegmentedControl label="View" className="border-0! bg-transparent! [&>div]:rounded-none! [&>div]:p-0!" value={mode} onValueChange={(v) => { setMode(v as typeof mode); if (v === "compare") { setCompareSet(null); setPair(null); } }}
              options={[{ value: "dashboard", label: "Dashboard" }, { value: "account", label: "Account" }, { value: "compare", label: "Compare" }]} />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <SourceStatus name="Grok Bot" logo={<GrokBotLogo className="size-5" />} onRefresh={loadReadings}
            state={isSample ? "sample" : "live"}
            rows={isSample ? [
              { label: "This account", value: "Invented sample, not read from X" },
              { label: "Last Grok run", value: lastRun ? `${since(lastRun, now)} · ${stamp(lastRun)}` : "No runs yet" },
            ] : [
              { label: "Last run", value: `${since(Date.parse(account.analyzedAt!), now)} · ${stamp(Date.parse(account.analyzedAt!))}` },
              { label: "This account", value: `${account.handle} · ${account.posts.length} posts` },
              { label: "Accounts read", value: fromGrok.length },
            ]} />
          <SourceStatus name="Gemini" logo={<GeminiLogo className="size-5" />} onRefresh={() => { setOddsNonce((n) => n + 1); return loadPrices(); }}
            state={odds.status === "ready" ? (ladders.length ? "live" : "error") : odds.status === "error" ? "error" : "loading"}
            rows={[
              { label: "Odds updated", value: odds.status === "ready" ? `${since(odds.at, now)} · ${clock(odds.at)}` : odds.status === "error" ? odds.message : "Loading…" },
              { label: "Prices updated", value: pricesAt ? `${since(pricesAt, now)} · ${clock(pricesAt)}` : "Loading…" },
              { label: "Latest candle", value: lastCandle ? `Hourly · ${clock(lastCandle)}` : "–" },
              { label: `${symbol} markets`, value: ladders.length ? `${ladders.length} open · next ${new Date(ladders[0].expiry).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })}` : "None open" },
            ]} />
          {/* Live while real swaps keep arriving from the Streams; amber when nothing has come in for a while. */}
          <SourceStatus name="QuickNode" logo={<QuickNodeMark className="h-4 w-auto" />} onRefresh={reloadStreams}
            state={streams.status === "loading" ? "loading" : streams.status === "error" ? "error" : streams.last !== null && now > 0 && now - streams.last < STREAMS_FRESH_MS ? "live" : "idle"}
            rows={streams.status === "ready" ? [
              { label: "Last swap", value: streams.last !== null ? `${since(streams.last, now)} · ${clock(streams.last)}` : "None in the last day" },
              ...streams.tokens.map((t) => ({ label: `${t.token} · ${t.chain === "solana" ? "Solana" : "Ethereum"}`, value: t.count ? `${t.count} swaps today · ${since(t.last!, now)}` : "No swaps today" })),
            ] : [{ label: "Streams", value: streams.status === "error" ? "Couldn't check" : "Checking…" }]} />
        </div>
      </header>

      {mode === "dashboard" ? (
        <Dashboard accounts={accounts} prices={prices} now={now} onSaved={loadReadings} onRemove={removeAccount}
          onOpen={(h) => { setChosen(h); setPicked(null); setLadderIndex(null); setMode("account"); }}
          onCompare={(hs) => { setCompareSet(hs); setPair([hs[0], hs[1]]); setMode("compare"); }} />
      ) : mode === "compare" && compareSet && pair ? (<>
        {compareSet.length > 2 && (
          <CompareTable now={now} accounts={accounts.filter((a) => compareSet.includes(a.handle))} prices={prices} pair={pair} onPair={setPair} />
        )}
        <CompareView key={pair.join()} accounts={accounts.filter((a) => compareSet.includes(a.handle))} prices={prices} initialA={pair[0]} initialB={pair[1]} />
      </>) : mode === "compare" ? (
        <CompareView key={account.handle} accounts={accounts} prices={prices} initialA={account.handle} />
      ) : (<>
      {/* Accounts Grok Bot read stay in view; the invented samples fold behind "+N more". */}
      {/* Same card as Compare's "Choose accounts" box. */}
      <nav aria-label="Accounts" className={`${card} grid gap-1.5`} style={{ ...neutralAccent, "--control-height-sm": "38px", "--text-sm": "0.875rem", "--space-2": "0.625rem" } as React.CSSProperties}>
        <span className={label}>Account</span>
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

        <p className="text-lg leading-relaxed text-pretty">
          <Verdict symbol={symbol} stance={stance} handle={displayName(account)} tally={tokenRecord} pricesReady={record !== null} match={match} ladder={ladder} odds={odds} series={prices?.[symbol]} reason={best?.reason} />
        </p>

        <PriceCallsChart symbol={symbol} series={prices?.[symbol]} sources={singleSource} />

        <ContractCard account={account} symbol={symbol} stance={stance} handle={displayName(account)} result={best} ladder={ladder} odds={odds} record={tokenRecord} calls={tokenCalls} current={prices?.[symbol]?.at(-1)?.[1] ?? null}
          others={otherMarkets} onLadder={setLadderIndex}
          leaning={all.filter((t) => t.symbol !== symbol && sideOf(t.score)).map((t) => t.symbol)} onPick={pick} />
      </section>

      <AccountOnchain key={account.handle + symbol} account={account} symbol={symbol} />

      <section>
        <Market symbol={symbol} odds={odds} ladders={ladders} ladder={ladder} onLadder={setLadderIndex} marks={[{ account, match }]} />
      </section>
      </>)}
      <SiteFooter onHome={() => { setMode("dashboard"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
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
    const rec = byToken?.find((b) => b.token === s.symbol);
    return {
      value: s.symbol,
      label: (
        <span className="flex items-center gap-1.5" title={s.posts ? TOKEN_NAMES[s.symbol] : `No posts about ${s.symbol} this week`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/tokens/${s.symbol.toLowerCase()}.svg`} alt="" className={`size-4 ${s.posts ? "" : "opacity-50 grayscale"}`} />
          {s.symbol}
          {s.posts === 0 && rec && rec.settled > 0 && <span className="font-mono text-[11px] text-muted-foreground">{rec.right}/{rec.settled}</span>}
        </span>
      ),
    };
  });
  return (
    // Arc tints the chosen chip with --accent; point it at the text colour here so it reads like the app's other selections.
    <div style={neutralAccent}>
      {/* Only the chosen token shows; the rest open from "+N more" and fold away again once one is picked. */}
      <ChipGroup key={resetKey + symbol} label="Token" multiple={false} maxVisible={0} options={options}
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
  // Plain text: the price and the week's move in brackets after the token.
  const token = now ? `${symbol} (${usd(now[1] >= 1000 ? Math.round(now[1]) : now[1])}${week !== null ? `, ${signed(week)} this week` : ""})` : symbol;

  if (stance.score === null) return <>{handle} hasn&apos;t posted about {token} this week.</>;
  const score = Math.round(stance.score);
  const side = sideOf(stance.score);
  const lean = side ? `${side === "bearish" ? 100 - score : score}% ${side}` : `mixed (${score}% bullish)`;

  const market = !side ? " No clear lean, so there's no contract to match."
    : odds.status === "loading" ? " Checking Gemini's odds…"
    : odds.status === "error" ? " Gemini's prediction markets aren't responding right now, so there's no bet to show."
    : !match || !ladder ? ` ${reason ?? "Gemini has no live contract on that side right now."}`
    : ` Gemini gives a ${pct(match.marketChance)} chance it ends ${match.side === "yes" ? "at or above" : "below"} ${usd(match.rung.strike)} by ${date(ladder.expiry)}; their posts put it near ${pct(match.accountChance)}, so the best bet is ${match.side === "yes" ? "Yes" : "No"} at ${cents(match.price)}.`;

  return <>{handle} is {lean} on {token}.{market}</>;
}


/**
 * The best Gemini contract for the account's view (lib/pick): what it costs and pays, the account's odds next to
 * the market's, the price levels from its posts that drove the pick, and the runner-ups.
 */
function ContractCard({ account, symbol, stance, handle, result, ladder, odds, record, calls, current, others, onLadder, leaning, onPick }: {
  account: Account; symbol: TokenSymbol; stance: TokenStance; handle: string; result: PickResult | null; ladder: Ladder | null; odds: OddsState;
  record: Tally | null; calls: Call[]; current: number | null; others: OtherMarket[]; onLadder: (i: number) => void; leaning: TokenSymbol[]; onPick: (t: TokenSymbol) => void;
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
      <div className="grid content-start gap-3 rounded-lg p-4 ring-1 ring-foreground/10 sm:col-span-2 lg:col-span-1">
        {head}
        <ContractTicketEmpty
          title={!side ? "No side to take" : odds.status === "loading" ? "Checking Gemini's odds…" : odds.status === "error" ? "Gemini isn't responding" : result?.reason?.startsWith("The market already") ? "Already priced in" : `No ${symbol} contract`}
          body={!side ? (stance.score === null ? `${handle} hasn't posted about ${symbol} this week.` : `${handle}'s ${symbol} posts are split.`) : odds.status === "loading" ? "One moment." : odds.status === "error" ? "Try again in a minute." : result?.reason?.startsWith("The market already") ? `Gemini's odds already match ${handle}'s view on this date, so no contract has an edge.` : result?.reason ?? `No live ${symbol} contract on that side right now.`}>
          {odds.status === "loading" || odds.status === "error" ? null : <OtherMarkets others={others} leaning={leaning} onLadder={onLadder} onCoin={onPick} />}
        </ContractTicketEmpty>
        {/* Shown here too: low confidence is often why there's no pick. */}
        {side && <div><Confidence record={record} calls={calls} symbol={symbol} /></div>}
      </div>
    );
  }
  const yes = match.side === "yes";
  const tone = yes ? "bg-good" : "bg-bad";
  const odd = (name: string, value: number, fill: string) => (
    <div className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <span className="truncate text-muted-foreground">{name}</span>
      <span className="h-1.5 rounded-full bg-foreground/[0.07]"><span className={`block h-1.5 rounded-full ${fill}`} style={{ width: pct(value) }} /></span>
      <span className="text-right font-mono tabular-nums">{pct(value)}</span>
    </div>
  );
  return (
    <div className="grid gap-3 rounded-lg p-4 ring-1 ring-foreground/10">
      {head}
      {/* The contract, laid out like Gemini's own market card, with the post behind it alongside. */}
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <ContractTicket symbol={symbol} ladder={ladder} side={match.side} rung={match.rung} price={match.price} current={current} live={odds.status === "ready"} />
        <SourceTweet fill account={account} pick={match} symbol={symbol} badge={<ConfidenceBadge record={record} symbol={symbol} />} />
      </div>

      {/* Chance this contract pays: by the account's view, then by Gemini's market. */}
      <div className="grid gap-1.5 border-t border-foreground/[0.07] pt-3">
        {odd(handle.length > 9 ? "Their odds" : `${handle}'s odds`, match.accountChance, tone)}
        {odd("Market's odds", match.marketChance, "bg-foreground/40")}
        <div className="text-xs text-muted-foreground">
          If {handle.length > 12 ? "they're" : `${handle} is`} right: <span className="font-medium text-foreground tabular-nums">+{Math.round(match.edge * 100)}¢</span> expected per $1 share
        </div>
      </div>
    </div>
  );
}





