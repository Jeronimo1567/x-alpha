"use client";
// Site footer: the app's mark, who Thales of Miletus was and his olive-press trade, links and credit on the left;
// on the right, Thales in ASCII, his shoulders resting on the bottom edge level with the links.

import { AsciiPortrait } from "@/components/ascii-portrait";
import { THALES_BUST_DARK, THALES_BUST_LIGHT } from "@/components/thales-ascii";
import { XAlphaLogo } from "@/components/x-alpha-logo";

const X_PROFILE = "https://x.com/jeronimoxyz";

export function SiteFooter({ onHome }: { onHome: () => void }) {
  const link = "rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
  // The bust sits on the footer's bottom edge, its shoulders fading into it so he doesn't float. Drawn on a canvas so the
  // letters under the cursor change to the opposite colour, then fade back. One shading per theme.
  const fade = "linear-gradient(to bottom, #000 62%, transparent 100%)";
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-border">
      <AsciiPortrait dark={THALES_BUST_DARK} light={THALES_BUST_LIGHT}
        className="absolute right-0 bottom-0 font-mono text-foreground/30 select-none md:text-foreground/90"
        style={{ maskImage: fade, WebkitMaskImage: fade }} />

      <div className="relative grid min-h-[400px] content-between gap-10 pt-10 pb-8 md:max-w-[44%]">
        <div className="grid gap-6">
          <button type="button" onClick={onHome} aria-label="X Alpha, go to dashboard"
            className="flex items-center gap-2.5 justify-self-start rounded-md text-lg font-semibold outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring">
            <XAlphaLogo className="h-7 w-auto" title="X Alpha" />
            X Alpha
          </button>

          <div className="grid gap-3">
            <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Thales of Miletus · c. 624–546 BC</span>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              A Greek philosopher, mathematician and astronomer from Miletus, often called the first philosopher of the Western tradition.
            </p>
            <p className="text-sm leading-relaxed text-pretty">
              People mocked philosophers for being poor. He read the stars, predicted a big olive harvest, and quietly reserved
              every olive press before anyone else. He made a fortune, then went back to philosophy.
            </p>
            <p className="text-sm font-semibold">It&apos;s the first recorded option trade, and he did it to make a point.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <button type="button" onClick={onHome} className={link}>Home</button>
            <a href={X_PROFILE} target="_blank" rel="noreferrer" className={link}>Contact</a>
            <span className="text-muted-foreground">
              Made by{" "}
              <a href={X_PROFILE} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">@jeronimoxyz</a>
              {" "}on X
            </span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
