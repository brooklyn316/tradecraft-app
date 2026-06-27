import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET — fetch pending orders for a participant
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  const db = getAdminClient();
  const { data, error } = await db
    .from("limit_orders")
    .select("*")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

// POST — place a new limit order
export async function POST(req: NextRequest) {
  try {
    const { participantId, symbol, companyName, action, shares, targetPrice } = await req.json();
    if (!participantId || !symbol || !action || !shares || !targetPrice) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getAdminClient();

    // Validate participant has enough cash (for buys) or shares (for sells)
    const { data: participant } = await db
      .from("competition_participants")
      .select("cash_balance")
      .eq("id", participantId)
      .single();

    if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    if (action === "buy") {
      const cost = shares * targetPrice;
      if (participant.cash_balance < cost) {
        return NextResponse.json({ error: `Insufficient cash — need $${cost.toFixed(2)}, have $${participant.cash_balance.toFixed(2)}` }, { status: 400 });
      }
    }

    if (action === "sell") {
      const { data: holding } = await db
        .from("holdings")
        .select("shares")
        .eq("participant_id", participantId)
        .eq("symbol", symbol)
        .single();
      if (!holding || holding.shares < shares) {
        return NextResponse.json({ error: `Insufficient shares — need ${shares}, have ${holding?.shares ?? 0}` }, { status: 400 });
      }
    }

    const { data, error } = await db
      .from("limit_orders")
      .insert({
        participant_id: participantId,
        symbol,
        company_name: companyName,
        action,
        shares,
        target_price: targetPrice,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw new Error(error.message ?? "Database error");
    return NextResponse.json({ order: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — cancel an order
export async function DELETE(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const db = getAdminClient();
    const { error } = await db
      .from("limit_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending");

    if (error) throw new Error(error.message ?? "Database error");
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
