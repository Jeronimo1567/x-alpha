"use client";
// The profiles picked on the dashboard, one row each, ranked by how following their calls went.
// Clicking two rows sets the head-to-head below.

import { useMemo } from "react";
import { Avatar } from "@/components/account-avatar";
import { LeanChip, LeanSparkline, summarize } from "@/components/dashboard";
import { card, displayName, label, signed } from "@/components/shared";
import type { Account } from "@/lib/sample";
import type { PriceSeries } from "@/lib/track";
import type { TokenSymbol } from "@/lib/stance";

export function CompareTable({ accounts, prices, now, pair, onPair }: {
  accounts: Account[]; prices: Partial<Record<TokenSymbol, PriceSeries>> | null; now: number;
  /** The two accounts in the head-to-head. */
  pair: [string, string]; onPair: (pair: [string, string]) => void;
}) {
  const rows = useMemo(
    () => accounts.map((a) => summarize(a, prices, Math.floor(now / 3_600_000) * 3_600_000)).sort((x, y) => (y.total ?? -Infinity) - (x.total ?? -Infinity)),
    [accounts, prices, now],
  );
  // Clicking a row not in the pair swaps out the older pick.
  const choose = (h: string) => { if (!pair.includes(h)) onPair([pair[1], h]); };

  return (
    <section className={`${card} grid gap-3`} aria-label="Selected profiles">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{rows.length} profiles</h2>
        <span className="text-xs text-muted-foreground">Ranked by following their calls · click a row to put it head to head</span>
      </div>
      <div className="hidden grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.6fr)] gap-4 px-2 sm:grid">
        <span className={label}>#</span><span className={label}>Account</span><span className={label}>Leans</span><span className={label}>Lean · 14 days</span>
      </div>
      <ol className="grid gap-1">
        {rows.map((s, i) => {
          const on = pair.includes(s.account.handle);
          return (
            <li key={s.account.handle}>
              <button type="button" onClick={() => choose(s.account.handle)} aria-pressed={on}
                className={`grid w-full items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.6fr)] ${on ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]"}`}>
                <span className="hidden font-mono text-xs text-muted-foreground sm:block">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar account={s.account} className="size-8 text-xs" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{displayName(s.account)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.account.handle}{s.total !== null && <> · <span className={s.total > 0 ? "text-good" : s.total < 0 ? "text-bad" : ""}>{signed(s.total / 100)}</span></>}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {s.leans.length ? s.leans.slice(0, 3).map((l) => <LeanChip key={l.symbol} {...l} />) : <span className="text-xs text-muted-foreground">No token posts</span>}
                </span>
                {/* Not scrubbable here: it sits inside the row button, which must hold no focusable parts. */}
                <span className="min-w-0"><LeanSparkline s={s} width={200} height={28} interactive={false} /></span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
