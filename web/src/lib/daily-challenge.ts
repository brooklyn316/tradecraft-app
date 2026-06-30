import { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// ── Challenge rotation (index by dayOfYear % 7) ───────────────────────────
export const CHALLENGE_ROTATION = [
  {
    title:          "Active Trader",
    description:    "Make 5 or more trades today",
    challenge_type: "trade_count",
    target_value:   5,
    reward_cash:    500,
    emoji:          "⚡",
  },
  {
    title:          "High Roller",
    description:    "Execute a single trade worth $2,000 or more",
    challenge_type: "big_single_trade",
    target_value:   2000,
    reward_cash:    750,
    emoji:          "💰",
  },
  {
    title:          "Diversifier",
    description:    "Hold 5 or more different stocks simultaneously",
    challenge_type: "diversify",
    target_value:   5,
    reward_cash:    400,
    emoji:          "🌐",
  },
  {
    title:          "Bull Run",
    description:    "Grow your total portfolio value by 1% or more today",
    challenge_type: "portfolio_gain",
    target_value:   1,
    reward_cash:    600,
    emoji:          "🐂",
  },
  {
    title:          "Volume King",
    description:    "Trade $5,000 or more in total buy volume today",
    challenge_type: "buy_volume",
    target_value:   5000,
    reward_cash:    450,
    emoji:          "📊",
  },
  {
    title:          "Short Seller",
    description:    "Open at least one short position today",
    challenge_type: "short_sell",
    target_value:   1,
    reward_cash:    600,
    emoji:          "🐻",
  },
  {
    title:          "Options Player",
    description:    "Buy at least one options contract today",
    challenge_type: "options_trade",
    target_value:   1,
    reward_cash:    800,
    emoji:          "🎯",
  },
] as const;

// ── Get or seed today's challenge ─────────────────────────────────────────
export async function getTodaysChallenge(db: DB) {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await db
    .from("daily_challenges")
    .select("*")
    .eq("date", today)
    .single();

  if (existing) return existing;

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const template = CHALLENGE_ROTATION[dayOfYear % CHALLENGE_ROTATION.length];

  const { data: seeded } = await db
    .from("daily_challenges")
    .insert({ date: today, ...template })
    .select()
    .single();

  return seeded;
}
