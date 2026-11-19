// QuickNode Streams filter for X Alpha: large ETH and BTC (as WBTC) swaps on Uniswap v3. Paste it into a Stream on
// Ethereum mainnet, dataset Block with Receipts, with X Alpha's /api/streams as the webhook destination.
//
// It reads the Swap events of the pools below. A pool's amounts are from the pool's side: positive means the pool
// received that token. If the pool paid out WETH (or WBTC) and took in dollars, the trader bought; the other way,
// they sold. The trader is the transaction's sender. Swaps under MIN_USD are skipped.
// Each one becomes { sig, time, token, chain: "ethereum", wallet, side, amount, usd }.
//
// MIN_USD can be changed without editing this code: put a number in the Key-Value Store under "xalpha-min-usd".

const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
// Pool address → which token X Alpha tracks, which side of the pool it is (token0 or token1), and decimals.
// In Uniswap pools token0 is the token with the lower address, which fixes the order below.
const POOLS = {
  "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640": { token: "ETH", base: 1, baseDec: 18, quoteDec: 6 }, // USDC/WETH 0.05%
  "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8": { token: "ETH", base: 1, baseDec: 18, quoteDec: 6 }, // USDC/WETH 0.3%
  "0x11b815efb8f581194ae79006d24e0d814b7697f6": { token: "ETH", base: 0, baseDec: 18, quoteDec: 6 }, // WETH/USDT 0.05%
  "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35": { token: "BTC", base: 0, baseDec: 8, quoteDec: 6 },  // WBTC/USDC 0.3%
};

async function main(stream) {
  let minUsd = 10000;
  try { const v = Number(await qnLib.qnGetValue("xalpha-min-usd")); if (v > 0) minUsd = v; } catch (e) { /* default */ }

  const items = Array.isArray(stream.data) ? stream.data : [stream.data];
  const swaps = [];
  for (const item of items) {
    if (!item) continue;
    const block = item.block || item;
    const time = Number(block.timestamp);
    for (const receipt of item.receipts || []) {
      if (receipt.status !== undefined && Number(receipt.status) !== 1) continue;
      for (const log of receipt.logs || []) {
        const pool = POOLS[String(log.address).toLowerCase()];
        if (!pool || !log.topics || log.topics[0] !== SWAP_TOPIC) continue;
        const data = String(log.data).slice(2);
        const amounts = [signed(data.slice(0, 64)), signed(data.slice(64, 128))];
        const base = amounts[pool.base], quote = amounts[1 - pool.base];
        const usd = Math.abs(Number(quote) / 10 ** pool.quoteDec);
        if (usd < minUsd) continue;
        swaps.push({
          // One transaction can hold several swaps (a multi-hop route): the log index keeps each one separate.
          sig: `${receipt.transactionHash}:${parseInt(log.logIndex, 16) || 0}`, time, token: pool.token, chain: "ethereum", wallet: receipt.from,
          // The pool paying out the base token (negative) means the trader bought it.
          side: base < 0n ? "buy" : "sell", amount: Math.abs(Number(base) / 10 ** pool.baseDec), usd,
        });
      }
    }
  }
  return swaps.length ? { swaps } : null;
}

/** A 32-byte two's-complement word as a BigInt. */
function signed(hex) {
  const n = BigInt("0x" + hex);
  return n >= 1n << 255n ? n - (1n << 256n) : n;
}
