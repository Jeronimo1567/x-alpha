"use client";
// One header for the three evidence cards (track record, vs the market, onchain), so they read as a set:
// title (and a badge), the question the card answers with where its numbers come from, and the source pill.

import type { ReactNode } from "react";
import { GeminiLogo, QuickNodeLogo } from "@/components/brand-logos";

const SOURCES = {
  gemini: { href: "https://www.gemini.com/prediction-markets", title: "Prices from Gemini's hourly candles", logo: <><GeminiLogo className="size-3.5" /><span className="text-xs font-medium">Gemini</span></> },
  quicknode: { href: "https://www.quicknode.com/streams", title: "Onchain data from QuickNode Streams", logo: <QuickNodeLogo className="h-3.5 w-auto text-foreground" /> },
} as const;

export function EvidenceHeader({ title, badge, question, detail, source, actions }: {
  title: string; badge?: ReactNode;
  /** The question the card answers, in a few words. */
  question: string;
  /** How it is worked out and from what. */
  detail: ReactNode;
  source: keyof typeof SOURCES;
  /** Extra controls left of the source pill (the Onchain card's dev-only simulate button). */
  actions?: ReactNode;
}) {
  const s = SOURCES[source];
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        <h2 className="flex flex-wrap items-center gap-2 font-semibold">{title}{badge}</h2>
        <p className="text-xs text-muted-foreground text-pretty"><span className="text-foreground">{question}</span> {detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <a href={s.href} target="_blank" rel="noreferrer" title={s.title} aria-label={s.title}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.04]">
          {s.logo}
        </a>
      </div>
    </div>
  );
}
