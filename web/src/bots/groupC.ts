// ============================================================
// Group C — Technical Analysis
// C1: RSI Reversal  C2: Breakout  C3: Mean Reversion
// ============================================================

import { BotContext, executeTrade, totalPortfolioValue } from "@/lib/botEngine";
import { GROUP_A_ALL_SYMBOLS } from "./groupA";

// Candidate universe shared with group A + B ETFs
const C_UNIVERSE = [...GROUP_A_ALL_SYMBOLS, "SPY", "QQQ"];

// ── Helpers ────────────────────────────────────────────────────

/** Returns the number of consecutive down days ending on the most recent day */
function consecutiveDownDays(closes: number[]): number {
  let count = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    if (closes[i] < closes[i - 1]) count++;
    else break;
  }
  return count;
}

/** Returns today's % change vs yesterday from price history */
function dayChangePct(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const prev = closes[closes.length - 2];
  const curr = closes[closes.length - 1];
  return prev > 0 ? (curr - prev) / prev * 100 : null;
}

// ── C1 — RSI Reversal Bot ─────────────────────────────────────
// Buy after 3 consecutive down days.
// Sell when +5% gain OR -3% loss from avg entry price.

export async function runC1(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio, history } = ctx;

  // Step 1: exit positions at target or stop-loss
  for (const holding of [...holdings]) {
    const price = prices.get(holding.symbol)?.price;
    if (!price) continue;
    const pnlPct = (price - holding.avg_cost) / holding.avg_cost * 100;
    if (pnlPct >= 5) {
      const result = await executeTrade({ ctx, symbol: holding.symbol, action: "sell", amount: "all", reason: `C1 take profit: +${pnlPct.toFixed(2)}%` });
      logs.push(`C1 sell ${holding.symbol}: ${result.message}`);
    } else if (pnlPct <= -3) {
      const result = await executeTrade({ ctx, symbol: holding.symbol, action: "sell", amount: "all", reason: `C1 stop-loss: ${pnlPct.toFixed(2)}%` });
      logs.push(`C1 stop ${holding.symbol}: ${result.message}`);
    }
  }

  // Step 2: scan for 3 consecutive down days
  for (const symbol of C_UNIVERSE) {
    if (holdings.find(h => h.symbol === symbol)) continue; // already holding

    const hist   = history.get(symbol) ?? [];
    const closes = hist.map(h => h.close);
    const downs  = consecutiveDownDays(closes);

    if (downs >= 3) {
      const spend  = Math.min(portfolio.cash_balance * 0.25, portfolio.cash_balance);
      if (spend < 1) break;
      const result = await executeTrade({ ctx, symbol, action: "buy", amount: spend, reason: `${downs} consecutive down days` });
      logs.push(`C1 buy ${symbol}: ${result.message}`);
    }
  }

  return logs;
}

// ── C2 — Breakout Bot ─────────────────────────────────────────
// Buy stocks up >2% today.
// Re-evaluate after 24 hours; sell if move has reversed (back below entry).

export async function runC2(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio } = ctx;

  // Step 1: exit reversed breakouts (price back below avg cost entry)
  for (const holding of [...holdings]) {
    const price = prices.get(holding.symbol)?.price;
    if (!price) continue;
    // Sell if below entry (reversal) or after being flat for a day
    if (price < holding.avg_cost) {
      const result = await executeTrade({ ctx, symbol: holding.symbol, action: "sell", amount: "all", reason: `C2: breakout reversed — price below entry` });
      logs.push(`C2 exit ${holding.symbol}: ${result.message}`);
    }
  }

  // Step 2: buy new breakouts (up >2% today)
  const breakouts = C_UNIVERSE
    .filter(s => !holdings.find(h => h.symbol === s))
    .map(s => ({ symbol: s, changePct: prices.get(s)?.change_percent ?? 0 }))
    .filter(x => x.changePct > 2)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 3); // top 3 breakouts max

  for (const { symbol, changePct } of breakouts) {
    const spend  = portfolio.cash_balance * 0.25;
    if (spend < 1) break;
    const result = await executeTrade({ ctx, symbol, action: "buy", amount: spend, reason: `Breakout: up ${changePct.toFixed(2)}% today` });
    logs.push(`C2 buy ${symbol}: ${result.message}`);
  }

  return logs;
}

// ── C3 — Mean Reversion Bot ───────────────────────────────────
// Buy stocks down >2% today, expecting a bounce.
// Sell at +3% recovery or cut at -5%.

export async function runC3(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { holdings, prices, portfolio } = ctx;

  // Step 1: exit positions at recovery target or stop
  for (const holding of [...holdings]) {
    const price  = prices.get(holding.symbol)?.price;
    if (!price) continue;
    const pnlPct = (price - holding.avg_cost) / holding.avg_cost * 100;
    if (pnlPct >= 3) {
      const result = await executeTrade({ ctx, symbol: holding.symbol, action: "sell", amount: "all", reason: `C3 recovery: +${pnlPct.toFixed(2)}%` });
      logs.push(`C3 take profit ${holding.symbol}: ${result.message}`);
    } else if (pnlPct <= -5) {
      const result = await executeTrade({ ctx, symbol: holding.symbol, action: "sell", amount: "all", reason: `C3 cut: ${pnlPct.toFixed(2)}%` });
      logs.push(`C3 stop ${holding.symbol}: ${result.message}`);
    }
  }

  // Step 2: buy dips (down >2% today)
  const dips = C_UNIVERSE
    .filter(s => !holdings.find(h => h.symbol === s))
    .map(s => ({ symbol: s, changePct: prices.get(s)?.change_percent ?? 0 }))
    .filter(x => x.changePct < -2)
    .sort((a, b) => a.changePct - b.changePct) // most down first
    .slice(0, 3);

  for (const { symbol, changePct } of dips) {
    const spend  = portfolio.cash_balance * 0.25;
    if (spend < 1) break;
    const result = await executeTrade({ ctx, symbol, action: "buy", amount: spend, reason: `Dip buy: down ${changePct.toFixed(2)}% today` });
    logs.push(`C3 buy ${symbol}: ${result.message}`);
  }

  return logs;
}
