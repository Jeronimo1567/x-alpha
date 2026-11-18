"use client";
// ASCII trading art drawn behind the dashboard hero. Each style is generated to fit the box it sits in (re-drawn on
// resize) and leaves room where the hero puts its text: centred styles clear the middle, left styles keep the left calm.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export type BackdropId = "candles" | "depth" | "tape" | "terrain" | "radar" | "braille" | "rays";

export const BACKDROPS: { id: BackdropId; name: string; align: "center" | "left"; kicker: string }[] = [
  { id: "candles", name: "Candles", align: "center", kicker: "X Alpha · live" },
  { id: "depth", name: "Depth", align: "center", kicker: "bid ◂ spread ▸ ask" },
  { id: "tape", name: "Tape", align: "center", kicker: "Markets · scanning" },
  { id: "terrain", name: "Terrain", align: "left", kicker: "// signal ≫ noise" },
  { id: "radar", name: "Radar", align: "left", kicker: "◆ signals locked" },
  { id: "braille", name: "Line", align: "left", kicker: "X Alpha · signals → odds" },
  { id: "rays", name: "Rays", align: "center", kicker: "X Alpha · face-off" },
];

const LH = 12; // line height in px; must match .ascii-art in globals.css

type Grid = { c: string; k: string }[][];
const makeGrid = (R: number, C: number): Grid => Array.from({ length: R }, () => Array.from({ length: C }, () => ({ c: " ", k: "" })));
const put = (G: Grid, r: number, c: number, ch: string, k: string) => { const cell = G[r]?.[c]; if (cell) { cell.c = ch; cell.k = k; } };
const write = (G: Grid, r: number, c: number, text: string, k: string) => [...text].forEach((ch, i) => put(G, r, c + i, ch, k));

/** Seeded so the art is the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

const esc = (ch: string) => (ch === "<" ? "&lt;" : ch === "&" ? "&amp;" : ch === ">" ? "&gt;" : ch);
function toHtml(G: Grid) {
  return G.map((row) => {
    let out = "", cur: string | null = null, buf = "";
    const flush = () => { if (buf) out += cur ? `<span class="${cur}">${buf}</span>` : buf; buf = ""; };
    for (const { c, k } of row) { if (k !== cur) { flush(); cur = k; } buf += esc(c); }
    flush();
    return out;
  }).join("\n");
}

/** Smooth 1-D value noise in [0, 1]: the same x always gives the same value, so scrolling art stays put as it moves. */
const hash = (n: number, seed: number) => { const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); };
const noise = (x: number, seed: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u; };
const fbm = (x: number, seed: number) => (noise(x, seed) * 0.5 + noise(x * 2, seed + 1) * 0.25 + noise(x * 4, seed + 2) * 0.125) / 0.875;

/** Each style draws one frame for the time t (seconds). */
type Draw = (R: number, C: number, cw: number, t: number) => Grid;

/** Frames per second per style: enough to look alive, low enough to stay cheap. */
const FPS: Record<Exclude<BackdropId, "tape">, number> = { candles: 12, depth: 10, terrain: 10, radar: 24, braille: 12, rays: 12 };

const draw: Record<Exclude<BackdropId, "tape">, Draw> = {
  // Only points: dotted lines fanning out from the centre (where a face-off puts its VS) over a faint dot grid,
  // brighter toward the edges. With animate, the dots drift outward along the lines.
  rays(R, C, cw, t) {
    const G = makeGrid(R, C), cx = (C - 1) / 2, cy = (R - 1) / 2, rays = 28, reach = Math.hypot(cx * cw, cy * LH);
    for (let r = 1; r < R; r += 3) for (let c = 0; c < C; c += 4) put(G, r, c, "·", "d");
    // Walk out along each ray, a dot every 9px; the start shifts with t so animated dots drift outward.
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + Math.PI / rays;
      for (let d = 50 + ((t * 18) % 9); d < reach; d += 9) {
        const c = Math.round(cx + (Math.cos(a) * d) / cw), r = Math.round(cy + (Math.sin(a) * d) / LH);
        const f = d / reach;
        put(G, r, c, "·", f > 0.45 ? "w" : "m");
      }
    }
    return G;
  },
  // Full-width candlesticks printing in from the right; the newest candle ticks live. The mask clears the middle.
  candles(R, C, _cw, t) {
    const G = makeGrid(R, C), N = Math.ceil(C / 2), speed = 0.8;
    const price = (k: number) => 60 * fbm(k * 0.06, 7) + 22 * (hash(k, 8) - 0.5) * 0.6 + 10 * fbm(k * 0.25, 9);
    const at = t * speed, k0 = Math.floor(at), frac = at - k0;
    const cs = Array.from({ length: N }, (_, i) => {
      const k = k0 - N + 1 + i, o = price(k - 1);
      const live = i === N - 1;
      const c = live ? o + (price(k) - o) * Math.min(1, frac * 1.4) + Math.sin(t * 9) * 0.6 : price(k);
      const grow = live ? Math.min(1, frac * 1.6) : 1;
      return { o, c, h: Math.max(o, c) + hash(k, 2) * 3 * grow, l: Math.min(o, c) - hash(k, 3) * 3 * grow, live };
    });
    const hi = Math.max(...cs.map((k) => k.h)), lo = Math.min(...cs.map((k) => k.l));
    const y = (v: number) => Math.round(((hi - v) / (hi - lo || 1)) * (R - 3)) + 1;
    const shift = k0 % 2; // grid dots scroll with the candles
    for (let r = 0; r < R; r += 4) for (let c = shift; c < C; c += 2) put(G, r, c, "·", "d");
    cs.forEach((k, i) => {
      const x = i * 2, up = k.c >= k.o, cl = up ? "g" : "r";
      for (let r = y(k.h); r <= y(k.l); r++) put(G, r, x, "│", cl + "2");
      const a = y(Math.max(k.o, k.c)), b = y(Math.min(k.o, k.c));
      for (let r = a; r <= Math.max(a, b); r++) put(G, r, x, up ? "█" : "▓", cl);
      if (k.live) { const r = y(k.c); for (let c = x + 2; c < C; c += 2) put(G, r, c, "╌", "a2"); }
    });
    return G;
  },

  // Low bid and ask walls that shift as orders come and go, kept subtle: a bright edge over a dim fill, no labels.
  depth(R, C, _cw, t) {
    const G = makeGrid(R, C), mid = Math.floor(C / 2), gap = 4;
    const side = (dir: 1 | -1, cl: string, seed: number) => {
      let h = 1;
      for (let i = gap; i <= mid + 1; i++) {
        if (i % 3 === 0) {
          const j = i / 3;
          h = 1 + Math.pow(i / mid, 2.3) * R * 0.5 + (noise(j * 0.7 + t * 0.9, seed) - 0.3) * 2 + (hash(Math.floor(t * 3), seed + j) > 0.93 ? 1 : 0);
        }
        const x = mid + dir * i, hh = Math.max(1, Math.min(R - 1, Math.round(h)));
        for (let r = R - hh; r < R; r++) {
          const d = r - (R - hh);
          put(G, r, x, d === 0 ? "▀" : d < 2 ? "▒" : "░", d === 0 ? cl : cl + "2");
        }
      }
    };
    side(-1, "g", 3); side(1, "r", 5);
    for (let c = 0; c < C; c++) if (G[R - 1][c].c === " ") put(G, R - 1, c, "─", "d");
    return G;
  },

  // An amber price mountain scrolling past, low on the left where the text is and climbing to the right.
  terrain(R, C, _cw, t) {
    const G = makeGrid(R, C), ramp = "@%#*+=-:. ", off = Math.floor(t * 5);
    const ys = Array.from({ length: C + 1 }, (_, c) => {
      const w = c + off, trend = smooth((c / C - 0.4) / 0.6);
      return Math.max(2, Math.min(R - 1, R * 0.9 - R * 0.68 * trend + (fbm(w * 0.05, 11) - 0.5) * R * 0.45 * smooth(c / C / 0.35)));
    });
    for (let c = 0; c < C; c++) {
      const top = Math.round(ys[c]), w = c + off;
      for (let r = top; r < R; r++) {
        const d = r - top, i = Math.min(ramp.length - 1, Math.floor(d * 0.9 + hash(w * 97 + r, 4) * 0.9));
        const edge = ys[c + 1] < ys[c] - 0.4 ? "/" : ys[c + 1] > ys[c] + 0.4 ? "\\" : "_";
        put(G, r, c, d === 0 ? edge : ramp[i], d === 0 ? "a" : d < 3 ? "a2" : "a3");
      }
      for (let r = 1; r < top - 1; r++) {
        if (c > C * 0.5 && hash(w * 31 + r, 6) > 0.985) {
          const tw = Math.sin(t * 3 + hash(w * 31 + r, 7) * 20);
          put(G, r, c, tw > 0.6 ? "+" : tw > -0.2 ? "·" : " ", tw > 0.6 ? "a2" : "a3");
        }
      }
    }
    return G;
  },

  // A radar on the right, sweeping round; each account or market lights up as the beam passes and then fades.
  radar(R, C, cw, t) {
    const G = makeGrid(R, C), cx = C * 0.78, cy = (R - 1) / 2, rmax = (R * LH) / 2 - 6, sweep = t * 1.5, TAU = Math.PI * 2;
    const behind = (a: number) => (((sweep - a) % TAU) + TAU) % TAU; // how far the beam has gone past angle a
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const dx = (c - cx) * cw, dy = (r - cy) * LH, d = Math.hypot(dx, dy);
      if (d > rmax + 4) continue;
      const da = behind(Math.atan2(dy, dx));
      if (Math.abs(d % (rmax / 4)) < 3.4) put(G, r, c, "·", "m");
      if (Math.round(r - cy) === 0) put(G, r, c, "─", "d");
      if (c === Math.round(cx)) put(G, r, c, "│", "d");
      if (d < rmax && da < 1.1) put(G, r, c, da < 0.08 ? "▓" : da < 0.3 ? "▒" : da < 0.7 ? "░" : "·", da < 0.3 ? "g" : "g2");
    }
    const s = rmax / 120;
    ([["$SOL", -62, -40], ["@cobie", 34, -62], ["FED-CUT", 64, 30], ["$BTC", -30, 64], ["$XRP", -96, 18]] as const).forEach(([name, dx, dy]) => {
      const c = Math.round(cx + (dx * s) / cw), r = Math.round(cy + (dy * s) / LH), lit = behind(Math.atan2(dy, dx));
      put(G, r, c, "◆", lit < 1.8 ? "w" : lit < 3.5 ? "m" : "d");
      write(G, r, c + 1, " " + name, lit < 1.8 ? "g" : lit < 3.5 ? "g2" : "d");
    });
    return G;
  },

  // A thin high-resolution line in braille dots (2×4 per character) scrolling left, with a live price tag at its tip.
  braille(R, C, _cw, t) {
    const W = C * 2, H = R * 4, off = Math.floor(t * 7), line = new Set<number>(), fill = new Set<number>(), key = (x: number, y: number) => y * W + x;
    const ys = Array.from({ length: W }, (_, x) => {
      const w = x + off, trend = smooth((x / W - 0.35) / 0.65);
      return Math.round(Math.max(H * 0.12, Math.min(H - 3, H * 0.9 - H * 0.6 * trend + (fbm(w * 0.025, 42) - 0.5) * H * 0.55 * (0.25 + trend))));
    });
    for (let x = 0; x < W; x++) {
      const a = ys[x], b = ys[x - 1] ?? a, w = x + off;
      for (let y = Math.min(a, b); y <= Math.max(a, b); y++) line.add(key(x, y));
      for (let y = a + 3; y < H; y++) if ((w + y) % 6 === 0 && y % 3 === 0) fill.add(key(x, y));
    }
    const bit = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]], G = makeGrid(R, C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      let L = 0, F = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
        const k = key(c * 2 + dx, r * 4 + dy);
        if (line.has(k)) L |= bit[dy][dx]; else if (fill.has(k)) F |= bit[dy][dx];
      }
      if (L) put(G, r, c, String.fromCharCode(0x2800 + (L | F)), "w");
      else if (F) put(G, r, c, String.fromCharCode(0x2800 + F), "m");
      else if (r % 5 === 0 && (c + Math.floor(off / 2)) % 3 === 0) put(G, r, c, "·", "d");
    }
    const tip = ys[W - 1], prob = Math.max(0.01, Math.min(0.99, 1 - tip / H));
    const prev = 1 - ys[W - 9] / H;
    const tag = ` ${prob >= prev ? "▲" : "▼"} ${prob.toFixed(2)} `;
    write(G, Math.max(0, Math.floor(tip / 4) - 1), C - tag.length - 2, tag, prob >= prev ? "g" : "r");
    return G;
  },
};

const TAPE = ["BTC>120K", "ETH>5K", "SOL>300", "XRP>3", "FED-CUT-DEC", "RATE-HOLD", "CPI<2.8", "BTC-ATH-Q1", "ETH/BTC>.04", "SOL-ETF", "XRP-ETF", "RECESSION-26", "SPX-7K", "DOGE>1"];

/** Rows of prediction-market tickers drifting in alternating directions. */
function Tape({ still }: { still: boolean }) {
  const rows = useMemo(() => {
    const rand = rng(3);
    return Array.from({ length: 22 }, (_, r) => ({
      dur: 50 + rand() * 60, opacity: 0.45 + rand() * 0.55, rev: r % 2 === 1,
      items: Array.from({ length: 14 }, () => ({ t: TAPE[Math.floor(rand() * TAPE.length)], up: rand() > 0.42, v: (rand() * 14).toFixed(1), p: Math.floor(rand() * 96 + 2) })),
    }));
  }, []);
  return (
    <div className="ascii-tape-rows">
      {rows.map((row, i) => (
        <div key={i} className={`ascii-row${row.rev ? " rev" : ""}`} style={{ animationDuration: `${row.dur}s`, opacity: row.opacity, animationPlayState: still ? "paused" : undefined }}>
          {[0, 1].map((dup) => (
            <span key={dup} aria-hidden={dup === 1}>
              {row.items.map((it, j) => (
                <span key={j}><span className="m">{it.t}</span> <span className="w">{it.p}¢</span> <span className={it.up ? "g" : "r"}>{it.up ? "▲" : "▼"}{it.v}%</span><span className="d">{"  ·  "}</span></span>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** `animate={false}` draws a single still frame. */
export function AsciiBackdrop({ id, animate = true, className = "", style }: { id: BackdropId; animate?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLPreElement>(null);
  const [size, setSize] = useState<{ R: number; C: number; cw: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const probe = document.createElement("span");
    probe.textContent = "M".repeat(100);
    probe.style.visibility = "hidden";
    el.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 100;
    el.removeChild(probe);
    const measure = () => setSize((s) => {
      const R = Math.ceil(el.clientHeight / LH), C = Math.ceil(el.clientWidth / cw) + 1;
      return s && s.R === R && s.C === C ? s : { R, C, cw };
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw frames straight into the <pre> (no React re-render per frame). Paused while the tab is hidden;
  // with reduced motion on, only the first frame is drawn.
  useEffect(() => {
    const el = ref.current;
    if (!el || !size || id === "tape") return;
    const paint = (t: number) => { el.innerHTML = toHtml(draw[id](size.R, size.C, size.cw, t)); };
    paint(0);
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now(), gap = 1000 / FPS[id];
    let raf = 0, last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < gap) return;
      last = now;
      paint((now - start) / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, size, animate]);

  return (
    <div aria-hidden="true" className={`ascii-backdrop ascii-${id} ${className}`} style={style}>
      {id === "tape" ? <Tape still={!animate} /> : null}
      <pre ref={ref} className="ascii-art" />
    </div>
  );
}

const BACKDROP_KEY = "x-alpha-backdrop";

/** Which ASCII style the hero shows, remembered in this browser. Candles until mounted so the prerender matches. */
/** `key` keeps each page's choice separate; `initial` is shown until the saved choice loads. */
export function useBackdrop(key = BACKDROP_KEY, initial: BackdropId = "candles"): [BackdropId, (id: BackdropId) => void] {
  const [id, setId] = useState<BackdropId>(initial);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(key); } catch { /* storage blocked: keep the default */ }
    const t = setTimeout(() => { if (BACKDROPS.some((b) => b.id === saved)) setId(saved as BackdropId); }, 0);
    return () => clearTimeout(t);
  }, [key]);
  return [id, (next) => { setId(next); try { localStorage.setItem(key, next); } catch { /* not remembered */ } }];
}

/** Small switcher for a hero's corner, for trying the backdrop styles. Not shown right now; kept for comparing them again. */
export function BackdropPicker({ value, onChange }: { value: BackdropId; onChange: (id: BackdropId) => void }) {
  return (
    <div role="radiogroup" aria-label="Backdrop style"
      className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full bg-background/70 p-0.5 font-mono text-[10px] tracking-wider uppercase ring-1 ring-foreground/10 backdrop-blur">
      {BACKDROPS.map((b, i) => (
        <button key={b.id} type="button" role="radio" aria-checked={value === b.id} title={b.name} onClick={() => onChange(b.id)}
          className={`rounded-full px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === b.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {String(i + 1).padStart(2, "0")}<span className="hidden sm:inline"> {b.name}</span>
        </button>
      ))}
    </div>
  );
}
