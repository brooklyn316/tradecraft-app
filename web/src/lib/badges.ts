import { SupabaseClient } from "@supabase/supabase-js";
import { awardMW, badgeMWReward } from "@/lib/market-wealth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// ── Badge catalogue ────────────────────────────────────────────────────────
export const BADGE_CATALOGUE = [
  // Streaks
  { type: "streak_3",      emoji: "🔥",  label: "On Fire",         desc: "3-day challenge streak" },
  { type: "streak_7",      emoji: "🌟",  label: "Week Warrior",    desc: "7-day challenge streak" },
  { type: "streak_30",     emoji: "👑",  label: "Legendary",       desc: "30-day challenge streak" },
  // Trades
  { type: "first_trade",   emoji: "🎯",  label: "First Blood",     desc: "Execute your first trade" },
  { type: "big_spender",   emoji: "💰",  label: "High Roller",     desc: "Single trade worth $2,000+" },
  // Instruments
  { type: "first_short",   emoji: "🐻",  label: "Bear Mode",       desc: "Open your first short position" },
  { type: "first_options", emoji: "⚙",   label: "Options Trader",  desc: "Buy your first options contract" },
  // Portfolio
  { type: "diversified",   emoji: "🌐",  label: "Diversified",     desc: "Hold 5 or more stocks at once" },
  // Challenges
  { type: "challenge_1",   emoji: "✅",  label: "Challenger",      desc: "Complete your first daily challenge" },
  { type: "challenge_10",  emoji: "🏆",  label: "Serial Completer",desc: "Complete 10 daily challenges" },
  // Return milestones
  { type: "profit_10pct",  emoji: "📈",  label: "Ten Bagger",      desc: "Achieve +10% portfolio return" },
] as const;

export type BadgeType = (typeof BADGE_CATALOGUE)[number]["type"];

// ── Award a badge (idempotent — uses ON CONFLICT DO NOTHING) ──────────────
export async function awardBadge(
  db: DB,
  userId: string,
  badgeType: BadgeType,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await db.from("user_badges").insert({
    user_id:    userId,
    badge_type: badgeType,
    metadata:   metadata ?? null,
  });
  // error code 23505 = unique_violation → already awarded
  return !error;
}

// ── Update streak after a daily challenge completion ──────────────────────
export async function updateStreak(db: DB, userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const { data: existing } = await db
    .from("user_streaks")
    .select("*")
    .eq("user_id", userId)
    .single();

  let newStreak = 1;

  if (existing) {
    if (existing.last_challenge_date === today) {
      // Already counted today
      return existing.current_streak;
    }
    if (existing.last_challenge_date === yesterday) {
      // Consecutive day
      newStreak = existing.current_streak + 1;
    }
    // else: gap — reset to 1
  }

  const newLongest = Math.max(newStreak, existing?.longest_streak ?? 0);

  await db.from("user_streaks").upsert({
    user_id:             userId,
    current_streak:      newStreak,
    longest_streak:      newLongest,
    last_challenge_date: today,
    updated_at:          new Date().toISOString(),
  }, { onConflict: "user_id" });

  return newStreak;
}

// ── Check and award all applicable badges for a user ─────────────────────
export async function checkAndAwardBadges(
  db: DB,
  userId: string,
  participantId: string,
  startingCash: number,
  stockPrices: Record<string, number>,
): Promise<string[]> {
  const awarded: string[] = [];

  // Fetch current badge set to avoid re-querying per badge
  const { data: existing } = await db
    .from("user_badges")
    .select("badge_type")
    .eq("user_id", userId);
  const has = new Set((existing ?? []).map((b: { badge_type: string }) => b.badge_type));

  // Helper: award badge + MW reward
  async function grant(type: BadgeType, meta?: Record<string, unknown>) {
    if (has.has(type)) return;
    const ok = await awardBadge(db, userId, type, meta);
    if (ok) {
      awarded.push(type);
      has.add(type);
      const mw = badgeMWReward(type);
      if (mw > 0) await awardMW(db, userId, mw, `badge_${type}`, type);
    }
  }

  // ── first_trade ──────────────────────────────────────────────────────────
  if (!has.has("first_trade")) {
    const { count } = await db.from("trades")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if ((count ?? 0) > 0) await grant("first_trade");
  }

  // ── big_spender ──────────────────────────────────────────────────────────
  if (!has.has("big_spender")) {
    const { data } = await db.from("trades")
      .select("total")
      .eq("participant_id", participantId)
      .eq("action", "buy")
      .gte("total", 2000)
      .limit(1);
    if (data?.length) await grant("big_spender");
  }

  // ── first_short ──────────────────────────────────────────────────────────
  if (!has.has("first_short")) {
    const { count } = await db.from("short_positions")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if ((count ?? 0) > 0) await grant("first_short");
  }

  // ── first_options ────────────────────────────────────────────────────────
  if (!has.has("first_options")) {
    const { count } = await db.from("option_positions")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if ((count ?? 0) > 0) await grant("first_options");
  }

  // ── diversified ──────────────────────────────────────────────────────────
  if (!has.has("diversified")) {
    const { count } = await db.from("holdings")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if ((count ?? 0) >= 5) await grant("diversified");
  }

  // ── challenge badges ─────────────────────────────────────────────────────
  if (!has.has("challenge_1") || !has.has("challenge_10")) {
    const { count } = await db.from("daily_challenge_completions")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    const n = count ?? 0;
    if (n >= 1)  await grant("challenge_1");
    if (n >= 10) await grant("challenge_10");
  }

  // ── profit_10pct ─────────────────────────────────────────────────────────
  if (!has.has("profit_10pct")) {
    const { data: participant } = await db
      .from("competition_participants")
      .select("cash_balance")
      .eq("id", participantId)
      .single();
    if (participant) {
      const { data: holdings } = await db.from("holdings")
        .select("symbol, shares").eq("participant_id", participantId);
      const holdVal = (holdings ?? []).reduce((s: number, h: { symbol: string; shares: number }) =>
        s + h.shares * (stockPrices[h.symbol] ?? 0), 0);
      const returnPct = ((participant.cash_balance + holdVal - startingCash) / startingCash) * 100;
      if (returnPct >= 10) await grant("profit_10pct", { return_pct: returnPct.toFixed(2) });
    }
  }

  // ── streak badges (checked from user_streaks) ────────────────────────────
  const { data: streak } = await db.from("user_streaks").select("current_streak").eq("user_id", userId).single();
  if (streak) {
    if (streak.current_streak >= 3)  await grant("streak_3");
    if (streak.current_streak >= 7)  await grant("streak_7");
    if (streak.current_streak >= 30) await grant("streak_30");
  }

  return awarded;
}
