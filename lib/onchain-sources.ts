// Which main tokens X Alpha's QuickNode Streams cover, and from where. No server code here, so the page can import it.
// BTC is read through WBTC and cbBTC, wrapped Bitcoin on Ethereum: stand-ins for BTC, not Bitcoin itself.
import type { TokenSymbol } from "./stance";

export type Chain = "solana" | "ethereum";

export const ONCHAIN: Partial<Record<TokenSymbol, { chain: Chain; source: string }>> = {
  SOL: { chain: "solana", source: "SOL swapped against USDC or USDT on Solana" },
  ETH: { chain: "ethereum", source: "WETH swapped against USDC or USDT on Uniswap" },
  BTC: { chain: "ethereum", source: "WBTC and cbBTC (wrapped Bitcoin) swapped against USDC or USDT on Uniswap" },
};

export const ONCHAIN_SOURCES = Object.fromEntries(Object.entries(ONCHAIN).map(([t, v]) => [t, v!.source])) as Partial<Record<TokenSymbol, string>>;

/** When X Alpha's QuickNode Streams started delivering real swaps. Calls whose window ends before this have no flow. */
export const STREAMS_STARTED = Date.parse("2026-11-20T08:20:00Z");
