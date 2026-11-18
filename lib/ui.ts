/**
 * One look for every "which one is chosen" control (account, token, range, market date):
 * the chosen one gets a soft frosted tint and outline, the rest stay quiet until hovered.
 */
export const selectable = (on: boolean) =>
  `outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
    on
      ? "bg-foreground/[0.07] text-foreground ring-1 ring-foreground/20 backdrop-blur-sm"
      : "text-muted-foreground ring-1 ring-foreground/10 hover:bg-foreground/[0.04] hover:text-foreground"
  }`;
