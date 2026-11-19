// QuickNode Streams filter for X Alpha: large SOL swaps on Solana. Paste it into a Stream on Solana mainnet,
// dataset Block, with X Alpha's /api/streams as the webhook destination.
//
// A swap counts when the transaction's fee payer (the trader) trades SOL (native or wrapped) against USDC or USDT,
// for at least MIN_USD. Their SOL going up is a buy, down is a sell; the stablecoin side gives the dollar size.
// Each one becomes { sig, time, token: "SOL", chain: "solana", wallet, side, amount, usd }. Blocks with none return
// null, so nothing is sent.
//
// MIN_USD can be changed without editing this code: put a number in the Key-Value Store under "xalpha-min-usd".

const WSOL = "So11111111111111111111111111111111111111112";
/** Implied SOL prices outside this range mean the trade wasn't SOL against dollars. */
const MIN_PRICE = 10, MAX_PRICE = 2000;
const STABLES = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

async function main(stream) {
  let minUsd = 10000;
  try { const v = Number(await qnLib.qnGetValue("xalpha-min-usd")); if (v > 0) minUsd = v; } catch (e) { /* default */ }

  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const swaps = [];
  for (const block of blocks) {
    if (!block || !Array.isArray(block.transactions)) continue;
    for (const tx of block.transactions) {
      const s = readSwap(tx, block, minUsd);
      if (s) swaps.push(s);
    }
  }
  return swaps.length ? { swaps } : null;
}

function readSwap(tx, block, minUsd) {
  const meta = tx && tx.meta;
  if (!meta || meta.err) return null;
  const message = tx.transaction && tx.transaction.message;
  const first = message && message.accountKeys && message.accountKeys[0];
  const wallet = typeof first === "string" ? first : first && first.pubkey;
  if (!wallet) return null;

  // The trader's change per mint, over all their token accounts.
  const delta = {};
  const add = (balances, sign) => {
    for (const b of balances || []) {
      if (b.owner !== wallet) continue;
      const ui = b.uiTokenAmount;
      const n = ui ? Number(ui.uiAmountString != null ? ui.uiAmountString : ui.uiAmount || 0) : 0;
      delta[b.mint] = (delta[b.mint] || 0) + sign * n;
    }
  };
  add(meta.preTokenBalances, -1);
  add(meta.postTokenBalances, +1);

  // Only SOL and dollars may move: a trader selling some other token for USDC also spends a little SOL on fees and
  // tips, and that must not read as a SOL sale.
  for (const mint in delta) {
    if (mint !== WSOL && !STABLES[mint] && Math.abs(delta[mint]) > 1e-9) return null;
  }

  let usd = 0;
  for (const mint in STABLES) usd += delta[mint] || 0;
  // Native SOL with the fee added back, plus wrapped SOL.
  const sol = ((meta.postBalances[0] || 0) - (meta.preBalances[0] || 0) + (meta.fee || 0)) / 1e9 + (delta[WSOL] || 0);

  // A swap moves SOL and dollars in opposite directions.
  if (Math.abs(usd) < minUsd || Math.abs(sol) < 1e-6 || Math.sign(usd) === Math.sign(sol)) return null;
  // The implied price must be a believable SOL price, or SOL wasn't really the other side of the trade.
  const price = Math.abs(usd / sol);
  if (price < MIN_PRICE || price > MAX_PRICE) return null;
  return {
    sig: tx.transaction.signatures && tx.transaction.signatures[0], time: block.blockTime,
    token: "SOL", chain: "solana", wallet, side: sol > 0 ? "buy" : "sell", amount: Math.abs(sol), usd: Math.abs(usd),
  };
}
