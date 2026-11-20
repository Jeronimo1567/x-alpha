// Prints each account's track record at every horizon: raw hit rate, alpha hit rate (beat the market), mean alpha
// and the t-stat hint. Uses real Gemini hourly prices, the sample accounts, and saved Grok readings (Vercel Blob when
// Upstash Redis is connected (KV_REST_API_URL / KV_REST_API_TOKEN), else .data/readings.json).
//   node scripts/alpha-report.mjs            (runs this file through jiti, so the app's TypeScript loads as is)
import { allPrices } from "@/lib/prices";
import { listReadings, toAccount } from "@/lib/readings";
import { ACCOUNTS, type Account } from "@/lib/sample";
import { HORIZONS, MIN_SETTLED, trackRecord, type HorizonTally } from "@/lib/track";

const pct = (n: number | null, d = 0) => (n === null ? "  –  " : `${(n * 100).toFixed(d)}%`);
const sgn = (n: number | null) => (n === null ? "   –   " : `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(2)}%`);
const cell = (t: HorizonTally) =>
  t.settled === 0 ? "—".padEnd(34) : `${String(t.settled).padStart(2)}  ${pct(t.hitRate).padStart(4)}  ${pct(t.alphaHitRate).padStart(4)}  ${sgn(t.meanAlpha).padStart(7)}  ${t.signal === "too few" ? "n<" + MIN_SETTLED : "t=" + t.tStat!.toFixed(1)}`.padEnd(34);

export async function main() {
  const prices = await allPrices();
  const readings = await listReadings().catch(() => []);
  const accounts: Account[] = [...readings.map((r) => toAccount(r)), ...ACCOUNTS];
  const span = prices.BTC ? `${new Date(prices.BTC[0][0]).toISOString().slice(0, 10)} → ${new Date(prices.BTC.at(-1)![0]).toISOString().slice(0, 16)}Z` : "no BTC";
  console.log(`Prices: ${Object.keys(prices).join(", ")} (${span}). Accounts: ${readings.length} saved readings + ${ACCOUNTS.length} samples.\n`);
  console.log(`cell = settled  raw-hit  alpha-hit  mean-alpha  significance\n`);
  console.log("account".padEnd(26) + HORIZONS.map((h) => h.key.padEnd(34)).join("") + "edge peak");
  for (const a of accounts) {
    const rec = trackRecord(a.posts, prices);
    const o = rec.overall;
    if (!rec.calls.length) { console.log(a.handle.padEnd(26) + "(no gradable calls)"); continue; }
    const d = o.decay;
    console.log(a.handle.slice(0, 25).padEnd(26) + HORIZONS.map((h) => cell(o.horizons[h.key])).join("") +
      (d.peak ? `${d.peak}${d.fadesBy ? ` (gone by ${d.fadesBy})` : ""}${d.tentative ? " ?" : ""}` : "none"));
    for (const t of rec.byToken.filter((b) => b.horizons["1d"].settled >= 3)) {
      console.log(("  " + t.token).padEnd(26) + HORIZONS.map((h) => cell(t.horizons[h.key])).join(""));
    }
  }
}
