"use client";
// Light/dark toggle on Arc's ThemeSwitch. The theme lives on <html data-theme>, set before paint by the script in
// app/layout.tsx; switching saves the choice and reveals the new theme as a circle growing from the button.

import { useEffect, useState } from "react";
import { ThemeSwitch, type Theme } from "@/components/arc/theme-switch/theme-switch";

export const THEME_KEY = "x-alpha-theme";

function apply(next: Theme) {
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: the choice just isn't remembered */ }
}

export function ThemeToggle() {
  // Light until mounted, then whatever the pre-paint script chose; the switch swaps its icon without animating.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const t = setTimeout(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeSwitch theme={theme} iconOnly onThemeChange={(next, _variant, trigger) => {
      const swap = () => { apply(next); setTheme(next); };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!document.startViewTransition || reduce) return swap();
      const { left, top, width, height } = trigger.getBoundingClientRect();
      const x = left + width / 2, y = top + height / 2;
      const root = document.documentElement.style;
      root.setProperty("--reveal-x", `${x}px`);
      root.setProperty("--reveal-y", `${y}px`);
      root.setProperty("--reveal-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
      document.startViewTransition(swap);
    }} />
  );
}
