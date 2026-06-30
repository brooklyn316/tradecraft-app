import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIMEFRAME_MINUTES: Record<string, number> = {
  "15min": 15,
  "1h":    60,
  "eod":   -1, // special: resolve at 4pm ET
};

function eodResolveAt(): Date {
  const now = new Date();
  const et  = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const eod = new Date(et);
  eod.setHours(16, 0, 0, 0);
  if (et >= eod) {
    // Market already closed — resolve tomorrow
    eod.setDate(eod.getDate() + 1);
  }
  // Convert back to UTC offset
  const offsetMs = now.getTime() - et.getTime();
  return new Date(eod.getTime() + offsetMs);
}

export async function POST(req: NextRequest) {
  try {
    const { participantId, competitionId, symbol, companyName, direction, stake, timeframe, currentPrice } = await req.json();

    if (!participantId || !symbol || !direction || !stake || !timeframe || !currentPrice) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!["up","down"].includes(direction)) {
      return NextResponse.json({ error: "direction must be up or down" }, { status: 400 });
    }
    if (!TIMEFRAME_MINUTES[timeframe]) {
      return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
    }
    if (stake < 10) {
      return NextResponse.json({ error: "Minimum stake $10" }, { status: 400 });
    }

    // Check cash
    const { data: participant } = await supabase
      .from("competition_participants")
      .select("cash_balance")
      .eq("id", participantId)
      .single();
    if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    if (participant.cash_balance < stake) {
      return NextResponse.json({ error: "Insufficient cash" }, { status: 400 });
    }

    // Calculate resolve_at
    const resolveAt = timeframe === "eod"
      ? eodResolveAt()
      : new Date(Date.now() + TIMEFRAME_MINUTES[timeframe] * 60 * 1000);

    // Deduct stake
    const { error: cashErr } = await supabase
      .from("competition_participants")
      .update({ cash_balance: participant.cash_balance - stake })
      .eq("id", participantId);
    if (cashErr) return NextResponse.json({ error: cashErr.message }, { status: 500 });

    // Insert bet
    const { data: bet, error: betErr } = await supabase
      .from("prediction_bets")
      .insert({
        participant_id: participantId,
        competition_id: competitionId,
        symbol,
        company_name: companyName ?? symbol,
        direction,
        entry_price:   currentPrice,
        stake,
        timeframe,
        resolve_at:    resolveAt.toISOString(),
      })
      .select()
      .single();

    if (betErr) return NextResponse.json({ error: betErr.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      bet,
      potentialPayout: Math.round(stake * 1.85 * 100) / 100,
      resolveAt: resolveAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
