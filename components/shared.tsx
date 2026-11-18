"use client";
// Pieces both the single-account view and the compare view use: formatting, the Gemini odds loader, and the inline price tag.

import { useEffect, useState } from "react";
import type { Ladder } from "@/lib/gemini";
import type { Account, Stance } from "@/lib/sample";
import type { TokenSymbol } from "@/lib/stance";

export const card = "rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10";
export const label = "font-mono text-[11px] uppercase tracking-wider text-muted-foreground";

export const stanceCls: Record<Stance, string> = {
  bullish: "bg-good-soft text-good",
  bearish: "bg-bad-soft text-bad",
  neutral: "bg-secondary text-secondary-foreground",
};
export const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 3 : 2 });
export const cents = (n: number) => Math.round(n * 100) + "¢";
export const pct = (n: number) => Math.round(n * 100) + "%";
export const ago = (d: number) => (d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`);
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n * 100).toFixed(1) + "%";
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Time only when it was today, otherwise the date too. */
export const stamp = (t: number) => new Date(t).toDateString() === new Date().toDateString() ? clock(t) : when(new Date(t).toISOString());
export const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The account's lean as a side to match, or null when it is mixed or there are no posts. */
export const sideOf = (score: number | null) => (score === null ? null : score >= 60 ? "bullish" : score <= 40 ? "bearish" : null);

export type OddsState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; ladders: Ladder[]; at: number };

/** While Gemini is failing, try again this often, so the page recovers on its own without a reload. */
const RETRY_MS = 20_000;

export function useOdds(symbol: TokenSymbol): OddsState {
  const [state, setState] = useState<{ symbol: TokenSymbol; odds: OddsState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const failed = (message: string) => {
      if (!live) return;
      // Keep the last good odds on screen during a retry; only show the error when there is nothing better.
      setState((prev) => (prev?.symbol === symbol && prev.odds.status === "ready" ? prev : { symbol, odds: { status: "error", message } }));
      retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    };
    fetch(`/api/odds?symbol=${symbol}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (r.ok) setState({ symbol, odds: { status: "ready", ladders: body.ladders, at: Date.now() } });
        else failed(body.error);
      })
      .catch(() => failed("Could not reach the server"));
    return () => { live = false; clearTimeout(retry); };
  }, [symbol, attempt]);
  return state?.symbol === symbol ? state.odds : { status: "loading" };
}


/** Arc tints the chosen chip with --accent; pointing it at the text colour makes Arc chips read like the app's other selections. */
export const neutralAccent = { "--accent": "var(--foreground)", "--accent-strong": "var(--foreground)" } as React.CSSProperties;

/** A price tag inside the summary sentence: a small tinted chip that keeps the numbers easy to spot. */
export function Tag({ tone, children, title }: { tone?: "good" | "bad"; children: React.ReactNode; title?: string }) {
  const cls = tone === "good" ? "bg-good-soft text-good" : tone === "bad" ? "bg-bad-soft text-bad" : "bg-foreground/[0.06] text-foreground";
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-px align-[0.08em] text-[0.88em] leading-snug font-semibold whitespace-nowrap tabular-nums ${cls}`}>
      {children}
    </span>
  );
}

export const DAY_MS = 86_400_000;

export const geminiUrl = (ladder: Ladder) => `https://www.gemini.com/predictions/${ladder.ticker}`;

export const shortWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });

/**
 * The name to use in sentences: the account's display name without emoji or symbols ("Ansem 🐂🤁️" → "Ansem")
 * and without the "(sample)" tag, falling back to the @handle when nothing readable is left.
 */
export function displayName(a: Account): string {
  const clean = a.name
    .replace(/\(sample\)/gi, "")
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}\p{Cf}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/[^\p{L}\p{N}\p{M}\s.'&-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return /\p{L}/u.test(clean) ? clean : a.handle;
}
