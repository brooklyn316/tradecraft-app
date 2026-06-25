// ============================================================
// Vercel Cron: /api/cron/run-bots
// Runs every 30 minutes during US market hours (9:30–16:00 ET weekdays).
// vercel.json cron: "*/30 14-21 * * 1-5"  (UTC, covers 9:30–16:30 ET)
//
// Also writes daily snapshots at market close (16:00 ET = ~21:00 UTC).
// ============================================================

import { NextResponse } from "next/server";
import {
  getBotLabClient,
  loadBotContext,
  writeDailySnapshot,
  refreshPrices,
  isMarketOpen,
} from "@/lib/botEngine";
import { GROUP_A_ALL_SYMBOLS, runA1, runA2, runA3, runA4, runA5 } from "@/bots/groupA";
import { B_SYMBOLS, runB1, runB2, runB3 } from "@/bots/groupB";
import { runC1, runC2, runC3 } from "@/bots/groupC";
import { runD1 } from "@/bots/groupD";
import { runE1, runE2, runE3, runE4, runE5, runE6 } from "@/bots/groupE";

// Verify this is a legitimate Vercel cron call
function verifyCronSecret(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Bot definitions: code → symbols + runner ──────────────────

const C_SYMBOLS = [...GROUP_A_ALL_SYMBOLS, "SPY", "QQQ"];

const BOT_RUNNERS: Record<string, {
  symbols: string[];
  run: (ctx: Awaited<ReturnType<typeof loadBotContext>>) => Promise<string[]>;
  // weekly: only run on Mondays (for B3 rebalance etc.)
  weeklyOnly?: boolean;
}> = {
  A1: { symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"], run: runA1 },
  A2: { symbols: GROUP_A_ALL_SYMBOLS, run: runA2 },
  A3: { symbols: GROUP_A_ALL_SYMBOLS, run: runA3 },
  A4: { symbols: ["KO", "JNJ", "JPM", "WMT", "XOM"], run: runA4 },
  A5: { symbols: GROUP_A_ALL_SYMBOLS, run: runA5 },
  B1: { symbols: B_SYMBOLS, run: runB1 },
  B2: { symbols: ["SPY"], run: runB2 },
  B3: { symbols: ["ENZL", "EWA", "EWJ"], run: runB3, weeklyOnly: true },
  C1: { symbols: C_SYMBOLS, run: runC1 },
  C2: { symbols: C_SYMBOLS, run: runC2 },
  C3: { symbols: C_SYMBOLS, run: runC3 },
  D1: { symbols: [...GROUP_A_ALL_SYMBOLS, ...B_SYMBOLS], run: runD1 },
  E1: { symbols: [], run: runE1 },   // symbols come from cache
  E2: { symbols: [], run: runE2 },
  E3: { symbols: [], run: runE3 },
  E4: { symbols: [], run: runE4 },
  E5: { symbols: [], run: runE5 },
  E6: { symbols: [], run: runE6 },
};

// ── Snapshot job ──────────────────────────────────────────────

/** True if the current call is within 30 min of market close (16:00 ET) */
function isNearMarketClose(): boolean {
  const etString = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etString);
  const minutesFromMidnight = et.getHours() * 60 + et.getMinutes();
  // 15:30–16:00 ET = 930–960 min
  return minutesFromMidnight >= 930 && minutesFromMidnight < 990;
}

// ── Main handler ──────────────────────────────────────────────

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMarketOpen()) {
    return NextResponse.json({ skipped: true, reason: "Market closed" });
  }

  const supabase    = getBotLabClient();
  const isMonday    = new Date().getDay() === 1;
  const isCloseTime = isNearMarketClose();
  const results: Record<string, { logs: string[]; error?: string }> = {};

  // Collect all symbols that need fresh prices
  const allSymbols = [...new Set(
    Object.values(BOT_RUNNERS).flatMap(b => b.symbols)
  )];

  // Refresh prices first (single batch call)
  try {
    await refreshPrices(allSymbols);
  } catch (err) {
    console.error("Price refresh failed:", err);
    // Continue — bots will use stale cached prices
  }

  // Run each bot
  for (const [code, config] of Object.entries(BOT_RUNNERS)) {
    if (config.weeklyOnly && !isMonday) continue;

    try {
      const ctx  = await loadBotContext(supabase, code, config.symbols);
      if (ctx.portfolio.is_dormant) {
        results[code] = { logs: [`${code}: dormant — skipped`] };
        continue;
      }

      const logs = await config.run(ctx);

      // Write daily snapshot at market close
      if (isCloseTime) {
        await writeDailySnapshot(ctx);
        logs.push(`${code}: daily snapshot written`);
      }

      results[code] = { logs };
    } catch (err) {
      console.error(`Bot ${code} error:`, err);
      results[code] = { logs: [], error: (err as Error).message };
    }
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
}
