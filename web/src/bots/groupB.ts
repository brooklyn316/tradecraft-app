// ============================================================
// Group B — Global Markets via ETFs
// B1: Global Rotation  B2: Safe Haven  B3: Pacific Focus
// All trade US-listed ETFs only.
// ============================================================

import { BotContext, executeTrade, totalPortfolioValue, holdingsValue } from "@/lib/botEngine";
import { PriceHistory } from "@/lib/botEngine";

export const B_SYMBOLS = ["SPY", "QQQ", "ENZL", "EWA", "EZU", "EWJ", "FXI"];

// ── B1 — Global Rotation Bot ──────────────────────────────────
// Always holds the 2 ETFs with the best 5-day return.
// Recalculates daily. Swaps out underperformers when rankings change.

export async function runB1(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio, history } = ctx;

  // Calculate 5-day return for each ETF
  const ranked = B_SYMBOLS
    .map(symbol => {
      const hist = history.get(symbol) ?? [];
      // Need at least 6 days (5-day return = (close[today] - close[5d ago]) / close[5d ago])
      if (hist.length < 2) return { symbol, return5d: 0 };
      const oldest = hist[Math.max(0, hist.length - 6)].close; // ~5 trading days ago
      const newest = hist[hist.length - 1].close;
      return { symbol, return5d: (newest - oldest) / oldest * 100 };
    })
    .sort((a, b) => b.return5d - a.return5d);

  const top2 = ranked.slice(0, 2).map(r => r.symbol);
  const currentSymbols = holdings.map(h => h.symbol);

  // Sell anything not in top 2
  for (const symbol of currentSymbols) {
    if (!top2.includes(symbol)) {
      const result = await executeTrade({ ctx, symbol, action: "sell", amount: "all", reason: `Dropped from top-2 ETFs (5d return rank)` });
      logs.push(`B1 sell ${symbol}: ${result.message}`);
    }
  }

  // Buy top 2 — split cash equally
  const portfolioTotal = totalPortfolioValue(holdings, prices, portfolio.cash_balance);
  const targetPerEtf   = portfolioTotal / 2;

  for (const symbol of top2) {
    const price       = prices.get(symbol)?.price;
    if (!price) continue;
    const holding     = holdings.find(h => h.symbol === symbol);
    const currentVal  = (holding?.shares ?? 0) * price;
    const deficit     = targetPerEtf - currentVal;
    if (deficit < 1) continue;
    const spend = Math.min(deficit, portfolio.cash_balance);
    if (spend < 1) continue;
    const result = await executeTrade({ ctx, symbol, action: "buy", amount: spend, reason: `Top-${top2.indexOf(symbol)+1} ETF by 5-day return` });
    logs.push(`B1 buy ${symbol}: ${result.message}`);
  }

  return logs;
}

// ── B2 — Safe Haven Bot ───────────────────────────────────────
// Holds SPY by default.
// Retreats to full cash if SPY drops >1% in a day.
// Re-enters SPY once SPY has a positive day.

export async function runB2(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio } = ctx;

  const spyRow     = prices.get("SPY");
  const spyChangePct = spyRow?.change_percent ?? 0;
  const holdingSpy = holdings.find(h => h.symbol === "SPY");

  if (spyChangePct < -1) {
    // Retreat to cash — sell all SPY
    if (holdingSpy && holdingSpy.shares > 0) {
      const result = await executeTrade({ ctx, symbol: "SPY", action: "sell", amount: "all", reason: `SPY down ${spyChangePct.toFixed(2)}% — retreating to cash` });
      logs.push(`B2 retreat: ${result.message}`);
    } else {
      logs.push("B2: already in cash, staying out");
    }
  } else if (spyChangePct >= 0) {
    // Positive day — re-enter or top up SPY with all available cash
    if (portfolio.cash_balance > 5) {
      const result = await executeTrade({ ctx, symbol: "SPY", action: "buy", amount: portfolio.cash_balance * 0.99, reason: `SPY positive (${spyChangePct.toFixed(2)}%) — re-entering` });
      logs.push(`B2 re-enter: ${result.message}`);
    } else {
      logs.push("B2: fully invested in SPY");
    }
  } else {
    logs.push(`B2: SPY flat, holding position`);
  }

  return logs;
}

// ── B3 — Pacific Focus Bot ────────────────────────────────────
// Equal weight across ENZL, EWA, EWJ. Rebalances weekly.
// (The cron caller checks day-of-week; this function does the rebalance.)

const B3_SYMBOLS = ["ENZL", "EWA", "EWJ"];

export async function runB3(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio } = ctx;

  const portfolioTotal = totalPortfolioValue(holdings, prices, portfolio.cash_balance);
  const targetPct      = 1 / B3_SYMBOLS.length; // 33.3% each
  const targetValue    = portfolioTotal * targetPct;

  // Sell overweight first, then buy underweight
  for (const symbol of B3_SYMBOLS) {
    const price      = prices.get(symbol)?.price;
    if (!price) continue;
    const holding    = holdings.find(h => h.symbol === symbol);
    const currentVal = (holding?.shares ?? 0) * price;
    const drift      = currentVal - targetValue;
    const driftPct   = Math.abs(drift) / portfolioTotal;

    if (driftPct < 0.05) continue; // within 5% tolerance

    if (drift > 0) {
      // Overweight — trim
      const excess       = drift;
      const sharesToSell = excess / price;
      const result       = await executeTrade({ ctx, symbol, action: "sell", amount: sharesToSell, reason: `Pacific rebalance — overweight ${(driftPct*100).toFixed(1)}%` });
      logs.push(`B3 trim ${symbol}: ${result.message}`);
    }
  }

  for (const symbol of B3_SYMBOLS) {
    const price      = prices.get(symbol)?.price;
    if (!price) continue;
    const holding    = holdings.find(h => h.symbol === symbol);
    const currentVal = (holding?.shares ?? 0) * price;
    const deficit    = targetValue - currentVal;
    const driftPct   = Math.abs(deficit) / portfolioTotal;

    if (driftPct < 0.05 || deficit < 1) continue;
    const spend  = Math.min(deficit, portfolio.cash_balance * 0.5);
    const result = await executeTrade({ ctx, symbol, action: "buy", amount: spend, reason: `Pacific rebalance — underweight ${(driftPct*100).toFixed(1)}%` });
    logs.push(`B3 add ${symbol}: ${result.message}`);
  }

  return logs;
}
