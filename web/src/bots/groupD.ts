// ============================================================
// Group D — Adaptive / Shadow Bot
// D1: Copies the current leaderboard leader.
//     Checks every 7 days, switches within 24h.
// ============================================================

import { BotContext, executeTrade, totalPortfolioValue, getBotLabClient } from "@/lib/botEngine";
import { runA1, runA2, runA3, runA4, runA5 } from "./groupA";
import { runB1, runB2, runB3 } from "./groupB";
import { runC1, runC2, runC3 } from "./groupC";
import { SupabaseClient } from "@supabase/supabase-js";

// ── Leaderboard query ─────────────────────────────────────────

export interface LeaderEntry {
  bot_id: string;
  bot_code: string;
  total_value: number;
  cumulative_return: number;
}

/** Returns the current leaderboard ranked by total_value (latest snapshot per bot) */
async function getLeaderboard(supabase: SupabaseClient): Promise<LeaderEntry[]> {
  // Get the most recent snapshot date
  const { data: latest } = await supabase
    .from("bot_daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  if (!latest) return [];

  const { data, error } = await supabase
    .from("bot_daily_snapshots")
    .select("bot_id, total_value, cumulative_return, bots!inner(code)")
    .eq("snapshot_date", latest.snapshot_date)
    .order("total_value", { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    bot_id: row.bot_id,
    bot_code: row.bots.code,
    total_value: row.total_value,
    cumulative_return: row.cumulative_return,
  }));
}

// ── Strategy dispatcher ───────────────────────────────────────
// Given a bot code, run that bot's strategy on D1's context.

async function runStrategy(code: string, ctx: BotContext): Promise<string[]> {
  switch (code) {
    case "A1": return runA1(ctx);
    case "A2": return runA2(ctx);
    case "A3": return runA3(ctx);
    case "A4": return runA4(ctx);
    case "A5": return runA5(ctx);
    case "B1": return runB1(ctx);
    case "B2": return runB2(ctx);
    case "B3": return runB3(ctx);
    case "C1": return runC1(ctx);
    case "C2": return runC2(ctx);
    case "C3": return runC3(ctx);
    default:   return [`D1: unknown strategy to mirror — ${code}`];
  }
}

// ── D1 — Shadow Bot ───────────────────────────────────────────

/** Stored in external_data_cache: { current_leader: "A2", last_checked: ISO string } */
const SHADOW_CACHE_KEY = "D1_shadow_state";

export async function runD1(ctx: BotContext): Promise<string[]> {
  const logs: string[] = [];
  const { supabase, bot } = ctx;

  // Load current shadow state
  const { data: cacheRow } = await supabase
    .from("external_data_cache")
    .select("payload, fetched_at")
    .eq("source", "shadow_bot")
    .eq("key", SHADOW_CACHE_KEY)
    .single();

  const state: { current_leader: string; last_checked: string } = cacheRow?.payload ?? {
    current_leader: "A1", // default: start by copying A1
    last_checked: new Date(0).toISOString(),
  };

  const now        = new Date();
  const lastCheck  = new Date(state.last_checked);
  const daysSince  = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24);

  // Check leaderboard every 7 days
  if (daysSince >= 7) {
    const board   = await getLeaderboard(supabase);
    const leaders = board.filter(e => e.bot_code !== "D1"); // exclude self

    if (leaders.length > 0) {
      const topValue  = leaders[0].total_value;
      const contender = leaders[0].bot_code;

      // Stay with current if tied
      if (contender !== state.current_leader) {
        const currentEntry = leaders.find(e => e.bot_code === state.current_leader);
        const currentValue = currentEntry?.total_value ?? 0;

        if (topValue > currentValue) {
          logs.push(`D1: switching from ${state.current_leader} → ${contender} ($${topValue.toFixed(2)} vs $${currentValue.toFixed(2)})`);
          state.current_leader = contender;
        } else {
          logs.push(`D1: tied — staying with ${state.current_leader}`);
        }
      } else {
        logs.push(`D1: ${state.current_leader} still leads — no switch`);
      }
    }

    state.last_checked = now.toISOString();

    // Persist updated state
    await supabase.from("external_data_cache").upsert({
      source: "shadow_bot",
      key: SHADOW_CACHE_KEY,
      payload: state,
      fetched_at: now.toISOString(),
    }, { onConflict: "source,key" });
  }

  logs.push(`D1: mirroring ${state.current_leader}`);

  // Run the target strategy on D1's own portfolio
  const stratLogs = await runStrategy(state.current_leader, ctx);
  return [...logs, ...stratLogs.map(l => `D1→${state.current_leader}: ${l}`)];
}
