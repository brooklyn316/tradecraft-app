import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, participantId, symbol, companyName, shares, currentPrice, currentCashBalance } = body;

    if (!action || !participantId || !symbol || !shares || !currentPrice) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── OPEN SHORT ──────────────────────────────────────────────────────────
    if (action === "short") {
      const proceeds = shares * currentPrice;

      // Check they don't already have a long position in this stock
      const { data: existing } = await supabase
        .from("holdings")
        .select("shares")
        .eq("participant_id", participantId)
        .eq("symbol", symbol)
        .maybeSingle();

      if (existing && existing.shares > 0) {
        return NextResponse.json({ error: "You already own shares in this stock. Sell them before shorting." }, { status: 400 });
      }

      // Check for existing short in this stock
      const { data: existingShort } = await supabase
        .from("short_positions")
        .select("id")
        .eq("participant_id", participantId)
        .eq("symbol", symbol)
        .maybeSingle();

      if (existingShort) {
        return NextResponse.json({ error: "You already have an open short on this stock." }, { status: 400 });
      }

      // Require collateral = proceeds (full cover) — cash must cover what you're shorting
      if (currentCashBalance < proceeds) {
        return NextResponse.json({ error: "Insufficient cash to cover collateral for this short." }, { status: 400 });
      }

      // Deduct collateral from cash (locked as security deposit)
      const { error: cashErr } = await supabase
        .from("competition_participants")
        .update({ cash_balance: currentCashBalance - proceeds })
        .eq("id", participantId);

      if (cashErr) return NextResponse.json({ error: cashErr.message }, { status: 500 });

      // Open the short position
      const { error: shortErr } = await supabase
        .from("short_positions")
        .insert({
          participant_id: participantId,
          symbol,
          company_name: companyName ?? symbol,
          shares,
          short_price: currentPrice,
          proceeds,
        });

      if (shortErr) {
        // Roll back cash deduction
        await supabase
          .from("competition_participants")
          .update({ cash_balance: currentCashBalance })
          .eq("id", participantId);
        return NextResponse.json({ error: shortErr.message }, { status: 500 });
      }

      // Record in trades table for activity feed
      await supabase.from("trades").insert({
        participant_id: participantId,
        symbol,
        company_name: companyName ?? symbol,
        action: "short",
        shares,
        price: currentPrice,
        total: proceeds,
      });

      return NextResponse.json({ success: true, action: "short", proceeds });
    }

    // ── COVER SHORT ─────────────────────────────────────────────────────────
    if (action === "cover") {
      const { data: position } = await supabase
        .from("short_positions")
        .select("*")
        .eq("participant_id", participantId)
        .eq("symbol", symbol)
        .maybeSingle();

      if (!position) {
        return NextResponse.json({ error: "No open short position found for this stock." }, { status: 400 });
      }

      const coverCost   = shares * currentPrice;
      const pnl         = (position.short_price - currentPrice) * shares;
      // Return collateral proportional to shares covered, plus P&L
      const collateralReturn = (shares / position.shares) * position.proceeds;
      const cashReturn  = collateralReturn + pnl;

      const { error: cashErr } = await supabase
        .from("competition_participants")
        .update({ cash_balance: currentCashBalance + cashReturn })
        .eq("id", participantId);

      if (cashErr) return NextResponse.json({ error: cashErr.message }, { status: 500 });

      // Full cover — delete position
      if (shares >= position.shares) {
        await supabase
          .from("short_positions")
          .delete()
          .eq("participant_id", participantId)
          .eq("symbol", symbol);
      } else {
        // Partial cover — reduce position
        await supabase
          .from("short_positions")
          .update({
            shares: position.shares - shares,
            proceeds: position.proceeds - collateralReturn,
            updated_at: new Date().toISOString(),
          })
          .eq("participant_id", participantId)
          .eq("symbol", symbol);
      }

      // Record in trades
      await supabase.from("trades").insert({
        participant_id: participantId,
        symbol,
        company_name: companyName ?? symbol,
        action: "cover",
        shares,
        price: currentPrice,
        total: coverCost,
      });

      return NextResponse.json({ success: true, action: "cover", pnl, cashReturn });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
