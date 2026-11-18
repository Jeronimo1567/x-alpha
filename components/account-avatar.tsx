"use client";

import { useState } from "react";
import type { Account } from "@/lib/sample";

/** Profile picture, falling back to initials if there is none or it fails to load. */
export function Avatar({ account, className }: { account: Account; className: string }) {
  // For accounts Grok Bot read without sending a picture, try a public avatar lookup by username.
  const src = account.avatar ?? (account.source === "grok" ? `https://unavatar.io/x/${account.handle.slice(1)}` : undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const initials = account.name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return src && failed !== src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFailed(src)} className={`${className} shrink-0 rounded-full bg-secondary object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${className} grid shrink-0 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground`}>{initials || "?"}</span>
  );
}
