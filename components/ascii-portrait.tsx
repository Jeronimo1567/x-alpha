"use client";
// ASCII art drawn on a canvas so each character can react to the pointer: letters under the cursor change colour
// toward the opposite (the page colour), then fade back to their normal colour once the cursor moves on. The animation only runs while something is still fading.

import { useEffect, useRef, type CSSProperties } from "react";

type Glyph = { ch: string; x: number; y: number; heat: number };

const RADIUS = 32;  // px around the cursor that react
const COOL = 0.9;   // how fast a flipped character fades back each frame

export function AsciiPortrait({ dark, light, className = "", style }: { dark: string; light: string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let glyphs: Glyph[] = [];
    let cw = 0, lh = 0, font = "", ink = "", paper = "";
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;

    const isDark = () => document.documentElement.dataset.theme === "dark";

    // Lay the characters out for the current width and theme; colours come from the page's CSS.
    const layout = () => {
      const art = (isDark() ? dark : light).replace(/^\n|\n$/g, "").split("\n");
      const px = Math.max(3, Math.min(7.4, window.innerWidth * 0.0075));
      const family = getComputedStyle(canvas).fontFamily || "ui-monospace, monospace";
      font = `${px}px ${family}`;
      ctx.font = font;
      cw = ctx.measureText("M").width;
      lh = px * 1.05;
      const cols = Math.max(...art.map((l) => l.length));
      const w = Math.ceil(cols * cw), h = Math.ceil(art.length * lh);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ink = getComputedStyle(canvas).color;
      paper = getComputedStyle(document.body).backgroundColor;
      glyphs = [];
      art.forEach((line, r) => [...line].forEach((ch, c) => { if (ch !== " ") glyphs.push({ ch, x: c * cw, y: r * lh, heat: 0 }); }));
      draw();
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      for (const g of glyphs) if (g.heat < 0.03) ctx.fillText(g.ch, g.x, g.y);
      // Characters under the cursor: the letter itself shifts toward the opposite colour (the page colour), no block.
      for (const g of glyphs) {
        if (g.heat < 0.03) continue;
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.fillText(g.ch, g.x, g.y);
        ctx.globalAlpha = g.heat * 0.82;
        ctx.fillStyle = paper;
        ctx.fillText(g.ch, g.x, g.y);
      }
      ctx.globalAlpha = 1;
    };

    // Heat up characters under the cursor and let the rest fade; returns whether anything is still flipped.
    const step = () => {
      let busy = false;
      for (const g of glyphs) {
        if (pointer) {
          const d = Math.hypot(g.x + cw / 2 - pointer.x, g.y + lh / 2 - pointer.y);
          if (d < RADIUS) g.heat = Math.max(g.heat, 1 - (d / RADIUS) * 0.6);
        }
        g.heat *= COOL;
        if (g.heat > 0.03) busy = true; else g.heat = 0;
      }
      return busy;
    };

    const frame = () => {
      const busy = step();
      draw();
      raf = busy || pointer ? requestAnimationFrame(frame) : 0;
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const move = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - b.left, y: e.clientY - b.top };
      wake();
    };
    const leave = () => { pointer = null; wake(); };

    layout();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    window.addEventListener("resize", layout);
    // Re-lay out when the theme flips (different shading, ink and page colour).
    const themeWatch = new MutationObserver(layout);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.fonts?.ready.then(layout).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      window.removeEventListener("resize", layout);
      themeWatch.disconnect();
    };
  }, [dark, light]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}
