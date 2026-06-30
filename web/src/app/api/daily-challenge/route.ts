import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

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
export async function getTodaysChallenge(db: ReturnType<typeof getAdminClient>) {
  const today = new Date().toISOString().split("T")[0];

  // Try to get existing
  const { data: existing } = await db
    .from("daily_challenges")
    .select("*")
    .eq("date", today)
    .single();

  if (existing) return existing;

  // Seed today's challenge based on day-of-year index
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const template = CHALLENGE_ROTATION[dayOfYear % CHALLENGE_ROTATION.length];

  const { data: seeded } = await db
    .from("daily_challenges")
    .insert({ date: today, ...template })
    .select()
    .single();

  return seeded;
}

// ── GET /api/daily-challenge ──────────────────────────────────────────────
// ?participantId=<uuid>  — optional, includes completion status
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = getAdminClient();

  const challenge = await getTodaysChallenge(db);
  if (!challenge) return NextResponse.json({ error: "Failed to load challenge" }, { status: 500 });

  let completion = null;
  let progress   = 0;

  if (participantId) {
    // Check if already completed
    const { data: comp } = await db
      .from("daily_challenge_completions")
      .select("*")
      .eq("challenge_id", challenge.id)
      .eq("participant_id", participantId)
      .single();

    completion = comp ?? null;

    // Compute progress
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00Z`;

    switch (challenge.challenge_type) {
      case "trade_count": {
        const { count } = await db.from("trades")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", participantId)
          .gte("executed_at", todayStart);
        progress = count ?? 0;
        break;
      }
      case "big_single_trade": {
        const { data } = await db.from("trades")
          .select("total")
          .eq("participant_id", participantId)
          .eq("action", "buy")
          .gte("executed_at", todayStart)
          .order("total", { ascending: false })
          .limit(1);
        progress = data?.[0]?.total ?? 0;
        break;
      }
      case "diversify": {
        const { count } = await db.from("holdings")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", participantId);
        progress = count ?? 0;
        break;
      }
      case "portfolio_gain": {
        const { data: participant } = await db
          .from("competition_participants")
          .select("cash_balance, competition_id")
          .eq("id", participantId)
          .single();
        if (participant) {
          const { data: comp } = await db
            .from("competitions")
            .select("starting_cash")
            .eq("id", participant.competition_id)
            .single();
          const startingCash = comp?.starting_cash ?? 10000;
          const { data: holdings } = await db
            .from("holdings")
            .select("symbol, shares")
            .eq("participant_id", participantId);
          const { data: prices } = await db.from("stock_prices").select("symbol, price");
          const priceMap = Object.fromEntries((prices ?? []).map(p => [p.symbol, p.price]));
          const holdVal = (holdings ?? []).reduce((s, h) => s + h.shares * (priceMap[h.symbol] ?? 0), 0);
          const totalVal = participant.cash_balance + holdVal;
          progress = ((totalVal - startingCash) / startingCash) * 100;
        }
        break;
      }
      case "buy_volume": {
        const { data } = await db.from("trades")
          .select("total")
          .eq("participant_id", participantId)
          .eq("action", "buy")
          .gte("executed_at", todayStart);
        progress = (data ?? []).reduce((s, t) => s + t.total, 0);
        break;
      }
      case "short_sell": {
        const { count } = await db.from("short_positions")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", participantId)
          .gte("created_at", todayStart);
        progress = count ?? 0;
        break;
      }
      case "options_trade": {
        const { count } = await db.from("option_positions")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", participantId)
          .gte("purchased_at", todayStart);
        progress = count ?? 0;
        break;
      }
    }
  }

  return NextResponse.json({ challenge, completion, progress });
}
