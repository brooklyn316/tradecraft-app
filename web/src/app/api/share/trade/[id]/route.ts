import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── GET /api/share/trade/[id] — public, no auth ───────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = getAdminClient();

  const { data: trade } = await db
    .from("trades")
    .select("id, symbol, action, shares, price, total, executed_at, participant_id")
    .eq("id", params.id)
    .single();

  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: participant } = await db
    .from("competition_participants")
    .select("user_id, competition_id")
    .eq("id", trade.participant_id)
    .single();

  const [{ data: profile }, { data: competition }] = await Promise.all([
    participant
      ? db.from("profiles").select("username").eq("id", participant.user_id).single()
      : Promise.resolve({ data: null }),
    participant
      ? db.from("competitions").select("name").eq("id", participant.competition_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    id:              trade.id,
    symbol:          trade.symbol,
    action:          trade.action,
    shares:          trade.shares,
    price:           trade.price,
    total:           trade.total,
    executed_at:     trade.executed_at,
    username:        (profile as { username?: string } | null)?.username ?? "Trader",
    competition_name:(competition as { name?: string } | null)?.name ?? "Tradecraft",
  });
}
