import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTodaysChallenge } from "@/lib/daily-challenge";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── GET /api/daily-challenge ──────────────────────────────────────────────
// ?participantId=<uuid>  — optional, includes completion status + progress
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = getAdminClient();

  const challenge = await getTodaysChallenge(db);
  if (!challenge) return NextResponse.json({ error: "Failed to load challenge" }, { status: 500 });

  let completion = null;
  let progress   = 0;

  if (participantId) {
    const { data: comp } = await db
      .from("daily_challenge_completions")
      .select("*")
      .eq("challenge_id", challenge.id)
      .eq("participant_id", participantId)
      .single();

    completion = comp ?? null;

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
          const { data: compRow } = await db
            .from("competitions")
            .select("starting_cash")
            .eq("id", participant.competition_id)
            .single();
          const startingCash = compRow?.starting_cash ?? 10000;
          const { data: holdings } = await db
            .from("holdings")
            .select("symbol, shares")
            .eq("participant_id", participantId);
          const { data: prices } = await db.from("stock_prices").select("symbol, price");
          const priceMap = Object.fromEntries((prices ?? []).map((p: { symbol: string; price: number }) => [p.symbol, p.price]));
          const holdVal = (holdings ?? []).reduce((s: number, h: { symbol: string; shares: number }) => s + h.shares * (priceMap[h.symbol] ?? 0), 0);
          progress = ((participant.cash_balance + holdVal - startingCash) / startingCash) * 100;
        }
        break;
      }
      case "buy_volume": {
        const { data } = await db.from("trades")
          .select("total")
          .eq("participant_id", participantId)
          .eq("action", "buy")
          .gte("executed_at", todayStart);
        progress = (data ?? []).reduce((s: number, t: { total: number }) => s + t.total, 0);
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
