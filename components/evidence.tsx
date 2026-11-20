"use client";
// The evidence under the main chart, three questions about one account's calls:
//   1. Were they right?        (Gemini prices)
//   2. Did they beat the market? (Gemini prices, minus the market's move)
//   3. Did big wallets agree?   (QuickNode Streams)
// A bar on top switches between the three; the logo on each tab says where its answer comes from.

import { useState, type CSSProperties } from "react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { MarketRecordCard } from "@/components/alpha-record";
import { GeminiLogo, QuickNodeMark } from "@/components/brand-logos";
import { AccountOnchain } from "@/components/onchain";
import { displayName, neutralAccent } from "@/components/shared";
import type { Account } from "@/lib/sample";
import type { TokenSymbol } from "@/lib/stance";
import type { TrackRecord } from "@/lib/track";

type View = "right" | "alpha" | "onchain";

const VIEWS: { value: View; label: string; source: "gemini" | "quicknode" }[] = [
  { value: "right", label: "Were they right?", source: "gemini" },
  { value: "alpha", label: "Beat the market?", source: "gemini" },
  { value: "onchain", label: "Big wallets agreed?", source: "quicknode" },
];

export function Evidence({ account, record, symbol }: { account: Account; record: TrackRecord | null; symbol: TokenSymbol }) {
  const [view, setView] = useState<View>("alpha");

  return (
    <div className="grid gap-3">
      {/* One bar, three questions; the logo on each says where its answer comes from. */}
      <div className="overflow-x-auto" style={{ ...neutralAccent, "--control-height-sm": "40px", "--text-sm": "0.875rem" } as CSSProperties}>
        <SegmentedControl label="Which evidence" fullWidth value={view} onValueChange={(v) => setView(v as View)}
          options={VIEWS.map((v) => ({
            value: v.value, label: v.label,
            accessory: v.source === "gemini"
              ? <GeminiLogo className="ml-1.5 size-3.5 opacity-70" />
              : <QuickNodeMark className="ml-1.5 h-3 w-auto opacity-70" />,
          }))} />
      </div>
      {view === "onchain"
        ? <AccountOnchain key={account.handle + symbol} account={account} symbol={symbol} />
        : view === "right"
          ? <MarketRecordCard key={account.handle + view} record={record} symbol={symbol} mode="raw" fixedCurve="raw" />
          : <MarketRecordCard key={account.handle + view} record={record} symbol={symbol} name={displayName(account)} />}
    </div>
  );
}
