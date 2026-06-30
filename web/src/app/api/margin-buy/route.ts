import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { participantId, symbol, companyName, shares, price, currentCashBalance, marginLimit } = await req.json();

    if (!participantId || !symbol || !shares || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const total = shares * price;
    const newCash = currentCashBalance - total;
    const borrowed = newCash < 0 ? Math.abs(newCash) : 0;

    // Enforce margin limit — borrowed amount cannot exceed margin_limit
    if (borrowed > marginLimit) {
      return NextResponse.json({
        error: `Exceeds margin limit. Max additional borrowing: $${(marginLimit - Math.max(0, -currentCashBalance)).toFixed(2)}`,
      }, { status: 400 });
    }

    // Fetch current holding
    const { data: holding } = await supabase
      .from("holdings")
      .select("shares, avg_cost")
      .eq("participant_id", participantId)
      .eq("symbol", symbol)
      .maybeSingle();

    const currentShares = holding?.shares ?? 0;
    const newShares = currentShares + shares;
    const avgCost = currentShares === 0
      ? price
      : (currentShares * (holding?.avg_cost ?? price) + total) / newShares;

    // Update cash (can go negative)
    const { error: cashErr } = await supabase
      .from("competition_participants")
      .update({ cash_balance: newCash })
      .eq("id", participantId);
    if (cashErr) return NextResponse.json({ error: cashErr.message }, { status: 500 });

    // Upsert holding
    const { error: holdingErr } = await supabase
      .from("holdings")
      .upsert(
        { participant_id: participantId, symbol, shares: newShares, avg_cost: avgCost, updated_at: new Date().toISOString() },
        { onConflict: "participant_id,symbol" }
      );
    if (holdingErr) return NextResponse.json({ error: holdingErr.message }, { status: 500 });

    // Record trade
    await supabase.from("trades").insert({
      participant_id: participantId,
      symbol,
      company_name: companyName ?? symbol,
      action: "buy",
      shares,
      price,
      total,
    });

    return NextResponse.json({ success: true, newCash, borrowed, leverageUsed: borrowed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
