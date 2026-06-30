import { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// ── MW reward amounts ──────────────────────────────────────────────────────
export const MW_REWARDS = {
  // Competition finish
  competition_participation: 100,
  competition_3rd:           150,  // + participation = 250 total
  competition_2nd:           400,  // + participation = 500 total
  competition_1st:           900,  // + participation = 1000 total
  bracket_win:              2000,
  // Daily challenge
  daily_challenge:            50,
  // Badges — by type
  badge_first_trade:          50,
  badge_big_spender:         100,
  badge_first_short:         150,
  badge_first_options:       200,
  badge_diversified:         100,
  badge_challenge_1:          50,
  badge_challenge_10:        300,
  badge_profit_10pct:        250,
  badge_streak_3:            100,
  badge_streak_7:            300,
  badge_streak_30:          1000,
} as const;

export type MWReason = keyof typeof MW_REWARDS;

// ── Award market wealth (idempotent via reference_id) ─────────────────────
export async function awardMW(
  db: DB,
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<void> {
  // Prevent double-awards for the same reason+reference
  if (referenceId) {
    const { data: existing } = await db
      .from("market_wealth_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", reason)
      .eq("reference_id", referenceId)
      .limit(1)
      .single();
    if (existing) return;
  }

  // Insert transaction
  await db.from("market_wealth_transactions").insert({
    user_id:      userId,
    amount,
    reason,
    reference_id: referenceId ?? null,
  });

  // Upsert balance
  const { data: current } = await db
    .from("market_wealth")
    .select("balance, total_earned")
    .eq("user_id", userId)
    .single();

  const newBalance  = (current?.balance      ?? 0) + amount;
  const newEarned   = (current?.total_earned  ?? 0) + (amount > 0 ? amount : 0);

  await db.from("market_wealth").upsert({
    user_id:      userId,
    balance:      Math.max(0, newBalance),
    total_earned: newEarned,
    updated_at:   new Date().toISOString(),
  }, { onConflict: "user_id" });
}

// ── MW reward for badge type ───────────────────────────────────────────────
export function badgeMWReward(badgeType: string): number {
  const key = `badge_${badgeType}` as MWReason;
  return (MW_REWARDS as Record<string, number>)[key] ?? 25;
}
