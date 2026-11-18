"use client";

import { Avatar } from "@/components/account-avatar";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { cents, card, geminiUrl, label, neutralAccent, pct, shortWhen, Tag, usd, type OddsState } from "@/components/shared";
import type { Ladder, Match } from "@/lib/gemini";
import type { Account } from "@/lib/sample";
import type { TokenSymbol } from "@/lib/stance";

export type MarketMark = { account: Account; match: Match | null };

/**
 * Gemini's price ladder for the token: a one-line read in tags, the settle date on Arc chips, and the ladder
 * as one continuous column shaded by chance. Only the contract that matches the account's lean takes a colour,
 * and a thin line marks where the market's 50/50 price falls.
 */
export function Market({ symbol, odds, ladders, ladder, onLadder, marks }: {
  symbol: TokenSymbol; odds: OddsState; ladders: Ladder[]; ladder: Ladder | null; onLadder: (i: number) => void;
  /** Contracts to point out on the ladder: one per account. With more than one, each shows its account's avatar. */
  marks: MarketMark[];
}) {
  const many = marks.length > 1;
  const rungs = ladder?.rungs.filter((r) => r.chance !== null) ?? [];
  const exp = ladder?.expectedPrice ?? null;
  // The 50/50 line sits between the last rung the market favours and the first it doesn't.
  const split = exp === null ? -1 : rungs.findIndex((r) => r.strike > exp);
  return (
    <div className={card}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">What the market thinks</h2>
        {ladder && <a href={geminiUrl(ladder)} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">View on Gemini ↗</a>}
      </div>
      {odds.status === "loading" && <p className="text-sm text-muted-foreground">Loading live odds from Gemini…</p>}
      {odds.status === "error" && <p className="text-sm text-bad">Couldn&apos;t load Gemini odds: {odds.message}. Reload to try again.</p>}
      {odds.status === "ready" && !ladder && <p className="text-sm text-muted-foreground">Gemini has no open {symbol} price markets right now.</p>}
      {ladder && (
        <div className="grid gap-4">
          <p className="text-[15px] leading-[1.9] text-pretty">
            The market sees{" "}
            <Tag>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/tokens/${symbol.toLowerCase()}.svg`} alt="" className="size-[1.05em]" />
              {symbol}
            </Tag>{" "}
            ending near <Tag>{exp === null ? "–" : usd(Math.round(exp))}</Tag> by {shortWhen(ladder.expiry)}.
          </p>

          <div style={neutralAccent}>
            <ChipGroup label="Settles" multiple={false} maxVisible={4}
              value={[ladder.ticker]}
              onValueChange={(v) => { const n = ladders.findIndex((l) => l.ticker === v[0]); if (n >= 0) onLadder(n); }}
              options={ladders.map((l) => ({ value: l.ticker, label: shortWhen(l.expiry) }))} />
          </div>

          <div>
            <div className={`${label} mb-2 flex justify-between`}><span>Ends at or above</span><span>Chance</span></div>
            <ul className="overflow-hidden rounded-lg ring-1 ring-foreground/10" aria-label={`Chance ${symbol} ends at or above each price`}>
              {rungs.map((r, n) => {
                const here = marks.filter((m) => m.match?.rung.instrument === r.instrument);
                const mine = here.length > 0;
                const tone = here[0]?.match?.side === "yes" ? "good" : "bad";
                return [
                  // The 50/50 line is its own thin row between rungs, so it never sits on top of a label.
                  n === split && split > 0 && (
                    <li key="split" className="flex h-5 items-center gap-2 px-3 text-[10px] font-medium text-muted-foreground" aria-label={`Market expects about ${usd(Math.round(exp!))}`}>
                      <span className="h-px flex-1 border-t border-dashed border-foreground/35" />
                      <span className="tabular-nums">50/50 · {usd(Math.round(exp!))}</span>
                      <span className="h-px flex-1 border-t border-dashed border-foreground/35" />
                    </li>
                  ),
                  <li key={r.instrument} className={`grid h-7 grid-cols-[5.25rem_1fr_3rem] items-center text-sm ${mine ? (tone === "good" ? "bg-good-soft" : "bg-bad-soft") : n % 2 ? "bg-foreground/[0.02]" : ""}`}>
                    <span className={`pl-3 tabular-nums ${mine ? "font-semibold" : "text-muted-foreground"}`}>{usd(r.strike)}</span>
                    <span className="relative h-full">
                      <span className={`absolute inset-y-1 left-0 rounded-r-sm ${mine ? (tone === "good" ? "bg-good" : "bg-bad") : "bg-foreground"}`}
                        style={{ width: pct(r.chance!), opacity: mine ? 0.85 : 0.12 + 0.68 * r.chance! }} />
                      {mine && (
                        <span className="absolute inset-y-0 right-2 flex items-center gap-2 text-[11px] font-semibold">
                          {/* Accounts pointing at the same side of this contract share one label, with their avatars stacked. */}
                          {(["yes", "no"] as const).map((side) => {
                            const who = here.filter((m) => m.match!.side === side);
                            if (!who.length) return null;
                            return (
                              <span key={side} className={`flex items-center gap-1 ${side === "yes" ? "text-good" : "text-bad"}`}>
                                {many && (
                                  <span className="flex -space-x-1.5">
                                    {who.map(({ account }) => <Avatar key={account.handle} account={account} className="size-4 text-[7px] ring-1 ring-card" />)}
                                  </span>
                                )}
                                {side === "yes" ? "Yes" : "No"} · {cents(who[0].match!.price)}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </span>
                    <span className="pr-3 text-right font-mono text-xs tabular-nums">{pct(r.chance!)}</span>
                  </li>,
                ];
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
