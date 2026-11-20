"use client";
// The Onchain card on an account's page: for each of its calls on the chosen token, the price with the post pinned
// on it (Gemini candles), and large-wallet buying and selling around it (QuickNode Streams). Built from the same Arc
// pieces as the rest of X Alpha.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Radio } from "lucide-react";
import { Avatar } from "@/components/account-avatar";
import { QuickNodeLogo } from "@/components/brand-logos";
import { EvidenceHeader } from "@/components/evidence-header";
import { Button } from "@/components/arc/button/button";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { LineChart, type LineChartDatum } from "@/components/arc/line-chart/line-chart";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { card, label, neutralAccent, when } from "@/components/shared";
import type { Impact } from "@/lib/impact";
import type { Account, Post } from "@/lib/sample";
import { TOKEN_NAMES, type TokenSymbol } from "@/lib/stance";
import { ONCHAIN_SOURCES } from "@/lib/onchain-sources";
import { postTime } from "@/lib/track";

const HOUR = 3_600_000;
const POLL_MS = 5_000;
const HEIGHT = 180;
/** Must match Arc's LineChart: room above the top gridline, and the value column on the right. */
const TOP = 12, GUTTER = 48;

const money = (n: number) => (n < 0 ? "−" : "") + "$" + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(Math.abs(n) / 1e3) + "k" : Math.round(Math.abs(n)).toString());
const change = (n: number | null, d = 1) => (n === null ? "–" : `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(d)}%`);
const price = (n: number | null) => (n === null ? "–" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 }));
const panel = "grid gap-3 rounded-xl p-4 ring-1 ring-foreground/10";

type Call = { post: Post; at: number; stance: "bullish" | "bearish" };

export function AccountOnchain({ account, symbol }: { account: Account; symbol: TokenSymbol }) {
  const source = ONCHAIN_SOURCES[symbol];
  // The account's bullish and bearish posts on this token, newest first.
  const calls = useMemo<Call[]>(() => account.posts
    .filter((p) => p.token === symbol && p.stance !== "neutral")
    .map((p) => ({ post: p, at: postTime(p), stance: p.stance as "bullish" | "bearish" }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 10), [account.posts, symbol]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  // Open on the newest call with at least 6 hours behind it, so there is an "after" to read; else the newest.
  const call = calls.find((c) => c.post.id === chosen) ?? calls.find((c) => Date.now() - c.at >= 6 * HOUR) ?? calls[0] ?? null;
  const h = account.handle.replace(/^@/, "");

  return (
    <section className={`${card} @container grid content-start gap-4`} aria-label="Onchain">
      <EvidenceHeader title="Onchain flow" source="quicknode" question="Did big wallets trade the same way?"
        detail={source ? <>Swaps of $10k or more around each {symbol} call from @{h}, live from QuickNode Streams: {source}.</> : <>Swaps of $10k or more around each call, live from QuickNode Streams.</>}
        actions={process.env.NODE_ENV !== "production" && source && call ? (
          <span style={neutralAccent}>
            <Button size="sm" variant="ghost" onClick={() => setSimulating((v) => !v)} aria-pressed={simulating}
              title={simulating ? "Stop simulating swaps" : "Simulate swaps (dev only)"} aria-label={simulating ? "Stop simulating swaps" : "Simulate swaps"}>
              <Activity className={`size-3.5 ${simulating ? "text-warn" : ""}`} aria-hidden="true" />
            </Button>
          </span>
        ) : null} />

      {!source ? (
        <div style={{ "--text-sm": "0.75rem" } as CSSProperties}>
          <EmptyState icon={<Radio width={24} height={24} strokeWidth={1.5} />} title={`Onchain flow isn't tracked for ${symbol} yet`}
            description={`${TOKEN_NAMES[symbol]} isn't on X Alpha's Streams. They cover ${Object.keys(ONCHAIN_SOURCES).join(", ")}: pick one of those to see large-wallet swaps around a call.`} />
        </div>
      ) : !call ? (
        <div style={{ "--text-sm": "0.75rem" } as CSSProperties}>
          <EmptyState icon={<Radio width={24} height={24} strokeWidth={1.5} />} title={`No ${symbol} calls from @${h}`}
            description={`Their ${symbol} posts never picked a direction, so there is no call to check against the chain.`} />
        </div>
      ) : (<>
        <div style={neutralAccent}>
          <ChipGroup label="Call" multiple={false} value={[call.post.id]} maxVisible={6}
            onValueChange={(v) => { if (v[0]) setChosen(v[0]); }}
            options={calls.map((c) => ({
              value: c.post.id,
              label: (
                <span className="flex items-center gap-1">
                  {c.stance === "bullish" ? <ArrowUpRight className="size-3 text-good" strokeWidth={2.75} aria-label="bullish" /> : <ArrowDownRight className="size-3 text-bad" strokeWidth={2.75} aria-label="bearish" />}
                  {when(new Date(c.at).toISOString())}
                </span>
              ),
            }))} />
        </div>
        <CallImpact key={call.post.id} account={account} symbol={symbol} call={call} simulating={simulating} />
      </>)}
    </section>
  );
}

function CallImpact({ account, symbol, call, simulating }: { account: Account; symbol: TokenSymbol; call: Call; simulating: boolean }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        if (simulating) await fetch("/api/streams/simulate", { method: "POST", body: JSON.stringify({ token: symbol }) });
        const r = await fetch(`/api/impact?token=${symbol}&at=${encodeURIComponent(new Date(call.at).toISOString())}&stance=${call.stance}`, { cache: "no-store" });
        const body = await r.json();
        if (!live) return;
        if (!r.ok) throw new Error(body.error);
        setImpact(body);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load the data");
      }
    };
    tick();
    // Keep refreshing while the 24 hours after the post are still running.
    const id = Date.now() < call.at + 24 * HOUR || simulating ? setInterval(tick, POLL_MS) : undefined;
    return () => { live = false; clearInterval(id); };
  }, [symbol, call.at, call.stance, simulating]);

  const view = useMemo(() => (impact ? chartData(impact) : null), [impact]);
  const right = impact?.callMove == null ? undefined : impact.callMove >= 0 ? "good" : "bad";

  return (
    <div className="grid gap-4">
      {error && <p className="text-sm text-bad">{error}</p>}

      {!impact || !view ? (
        !error && <TextShimmer className="text-sm text-muted-foreground">Reading the price and the Streams…</TextShimmer>
      ) : <>
        {impact.flags.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Verdict">
            {impact.flags.map((f) => (
              <li key={f.label} className={`grid gap-0.5 rounded-xl px-3 py-2 ${f.tone === "bad" ? "bg-bad-soft" : f.tone === "good" ? "bg-good-soft" : "bg-foreground/[0.04]"}`}>
                <span className={`text-sm font-semibold ${f.tone === "bad" ? "text-bad" : f.tone === "good" ? "text-good" : ""}`}>{f.label}</span>
                <span className="text-xs text-muted-foreground">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 1. The post on the price: the tweet pinned where it was posted. */}
        <div className={panel}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="grid gap-0.5">
              <span className={label}>Price and the post</span>
              <span className="text-sm">
                <span className="font-semibold">{symbol}</span>{" "}
                <span className={`font-semibold tabular-nums ${right === "good" ? "text-good" : right === "bad" ? "text-bad" : ""}`}>{change(impact.change)}</span>
                <span className="text-muted-foreground"> since the post{impact.best !== null && impact.worst !== null ? ` · best ${change(impact.best)}, worst ${change(impact.worst)} for the call` : ""}</span>
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{price(impact.priceAtPost)} → {price(impact.priceNow)}</span>
          </div>
          <Marked view={view} pin={{ call, account }}>
            <LineChart label={`${symbol} price around the post`} categoryLabel="Time" data={view.data} height={HEIGHT} legend={false}
              series={[{ key: "change", label: symbol, color: "var(--foreground)" }]}
              formatValue={(v) => `${change(v / 100, 2)} · ${price(impact.priceAtPost === null ? null : impact.priceAtPost * (1 + v / 100))}`}
              formatTick={(v) => change(v / 100, Number.isInteger(v) ? 0 : 1)} />
          </Marked>
        </div>

        {/* 2. Large-wallet buying and selling onchain, from the QuickNode Streams. */}
        <div className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <span className={`${label} flex items-center gap-1.5`}>Wallets taking a side · swaps of $10k+
                {impact.simulated && <span className="rounded-md bg-warn-soft px-1.5 py-px font-semibold normal-case tracking-normal text-warn">Simulated</span>}
              </span>
              <span className="text-sm">
                <span className="text-muted-foreground">After the post: </span>
                <span className="font-semibold tabular-nums">{money(impact.after.buyUsd)}</span><span className="text-muted-foreground"> bought, </span>
                <span className="font-semibold tabular-nums">{money(impact.after.sellUsd)}</span><span className="text-muted-foreground"> sold · net </span>
                <span className={`font-semibold tabular-nums ${impact.after.netUsd >= 0 ? "text-good" : "text-bad"}`}>{impact.after.netUsd >= 0 ? "+" : ""}{money(impact.after.netUsd)}</span>
              </span>
              {/* Two-way wallets (market makers, arbitrage and routing bots) are left out of the chart and the verdict. */}
              {impact.excluded.wallets > 0 && (
                <span className="text-xs text-muted-foreground" title="Wallets that bought and sold similar amounts, or swapped more than 20 times, in this window: market makers and bots, not wallets taking a view.">
                  Left out {impact.excluded.wallets} two-way {impact.excluded.wallets === 1 ? "wallet" : "wallets"} (bots, market makers): {money(impact.excluded.usd)} in {impact.excluded.trades} swaps
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><QuickNodeLogo className="h-3.5 w-auto text-foreground" />Streams</span>
          </div>
          <Marked view={view} legend>
            <LineChart label={`${symbol} large buys and sells`} categoryLabel="Time" data={view.data} height={HEIGHT}
              series={[{ key: "buys", label: "Bought ($ per 30 min)", color: "var(--good)" }, { key: "sells", label: "Sold ($ per 30 min)", color: "var(--bad)", area: true }]}
              formatValue={(v) => money(v)} formatTick={(v) => money(v)} />
          </Marked>
        </div>

        <dl className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Stat name="Since the post" value={change(impact.change)} tone={right} note={`${price(impact.priceAtPost)} → ${price(impact.priceNow)}`} />
          <Stat name="Net large flow after" value={(impact.after.netUsd >= 0 ? "+" : "") + money(impact.after.netUsd)} tone={impact.after.trades ? ((impact.after.netUsd >= 0) === (call.stance === "bullish") ? "good" : "bad") : undefined}
            note={`${impact.after.trades} swaps · ${impact.after.wallets} wallets`} />
          <Stat name="Net large flow 12h before" value={(impact.before.netUsd >= 0 ? "+" : "") + money(impact.before.netUsd)} note={`${impact.before.trades} swaps · ${impact.before.wallets} wallets`} />
          <Stat name="Bought vs sold after" value={impact.after.buyUsd + impact.after.sellUsd ? `${Math.round((impact.after.buyUsd / (impact.after.buyUsd + impact.after.sellUsd)) * 100)}% buys` : "–"}
            note={`${money(impact.after.buyUsd)} bought · ${money(impact.after.sellUsd)} sold`} />
        </dl>

      </>}
    </div>
  );
}

type View = { data: LineChartDatum[]; postX: number; postY: number };

/** Arc's value scale (gridlines from zero unless the data dips below it), so the pin sits exactly on the line. */
function niceScale(low: number, high: number) {
  const lo = Math.min(0, low), hi = Math.max(high, lo + 1);
  const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / 4));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = factor * magnitude, bottom = Math.floor(lo / step) * step, top = Math.ceil(hi / step) * step;
    if ((top - bottom) / step <= 4 + 1e-9) return { min: bottom, max: top };
  }
  return { min: lo, max: hi };
}

/** One point per half hour: the price as change from the post, and dollars bought and sold in large swaps. */
function chartData(impact: Impact): View {
  const { bars, bucketMs } = impact;
  const base = impact.priceAtPost ?? bars.find((b) => b.price !== null)?.price ?? null;
  const postIdx = Math.max(0, bars.findIndex((b) => b.t >= impact.postAt));
  const every = Math.round((6 * HOUR) / bucketMs);
  let last = base;
  const data = bars.map((b, i) => {
    if (b.price !== null) last = b.price;
    const steps = i - postIdx, rel = (steps * bucketMs) / HOUR;
    return {
      key: String(b.t),
      label: `${when(new Date(b.t).toISOString())} · ${rel === 0 ? "at the post" : rel > 0 ? `${rel}h after` : `${-rel}h before`}`,
      axisLabel: steps === 0 ? "Post" : steps % every === 0 ? `${rel > 0 ? "+" : ""}${rel}h` : undefined,
      values: { change: base && last ? (last / base - 1) * 100 : 0, buys: b.buyUsd, sells: b.sellUsd },
    };
  });
  const changes = data.map((d) => d.values.change);
  const scale = niceScale(Math.min(...changes), Math.max(...changes));
  const postY = 1 - ((changes[postIdx] ?? 0) - scale.min) / (scale.max - scale.min || 1);
  return { data, postX: data.length > 1 ? postIdx / (data.length - 1) : 0.5, postY };
}

/**
 * A chart with the post marked as a dashed line across the plot. With a pin, the account's avatar sits on the line where
 * it posted and the tweet floats beside it, on the side with more room; it opens on X.
 */
function Marked({ view, legend, pin, children }: { view: View; legend?: boolean; pin?: { call: Call; account: Account }; children: React.ReactNode }) {
  // Arc puts the legend (32px row plus its 16px gap) above the plot when there is one.
  const offset = legend ? 48 : 0;
  const left = `${view.postX * 100}%`;
  const onRight = view.postX < 0.45;
  const url = pin?.call.post.url;
  const Card = url ? "a" : "div";
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute left-0" style={{ right: GUTTER, top: offset + TOP, height: HEIGHT - TOP }}>
        <span aria-hidden="true" className="absolute top-0 bottom-0 w-px -translate-x-1/2 border-l border-dashed border-foreground/40" style={{ left }} />
        {pin ? <>
          <span aria-hidden="true" className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card shadow-sm ring-2 ${pin.call.stance === "bullish" ? "ring-good" : "ring-bad"}`}
            style={{ left, top: `${view.postY * 100}%` }}>
            <Avatar account={pin.account} className="size-6 text-[9px]" />
          </span>
          <Card {...(url ? { href: url, target: "_blank", rel: "noreferrer" } : {})}
            className="pointer-events-auto absolute top-0 grid w-[260px] max-w-[45%] grid-cols-[minmax(0,1fr)] gap-1.5 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
            style={onRight ? { left: `calc(${left} + 18px)` } : { right: `calc(${100 - view.postX * 100}% + 18px)` }}>
            <div className="flex items-center gap-2">
              <Avatar account={pin.account} className="size-7 text-[10px]" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold">{pin.account.name}</div>
                <div className="truncate text-xs text-muted-foreground">{pin.account.handle} · {when(new Date(pin.call.at).toISOString())}</div>
              </div>
              <XMark className="size-3.5 shrink-0" />
            </div>
            <p className="line-clamp-3 text-sm leading-snug">{pin.call.post.text.replace(/\s*https:\/\/t\.co\/\S+/g, "")}</p>
            <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${pin.call.stance === "bullish" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{pin.call.stance}</span>
          </Card>
        </> : (
          <span aria-hidden="true" className="absolute -top-1 -translate-x-1/2 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm ring-1 ring-foreground/15" style={{ left }}>Post</span>
        )}
      </div>
    </div>
  );
}

function XMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className}`} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Stat({ name, value, note, tone }: { name: string; value: string; note: string; tone?: "good" | "bad" }) {
  return (
    // Same box as the track record's horizon cells, so the three evidence views read alike.
    <div className="grid content-start gap-0.5 rounded-lg bg-foreground/[0.03] px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{name}</dt>
      <dd className={`text-base font-semibold tabular-nums ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</dd>
      <dd className="text-[11px] text-muted-foreground">{note}</dd>
    </div>
  );
}
