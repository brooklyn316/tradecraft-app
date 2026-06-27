import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface LimitOrder {
  id: string;
  participant_id: string;
  symbol: string;
  company_name: string | null;
  action: "buy" | "sell";
  shares: number;
  target_price: number;
}

async function executeTrade(db: DB, order: LimitOrder, filledPrice: number): Promise<boolean> {
  const total = order.shares * filledPrice;

  // Fetch current participant state
  const { data: participant } = await db
    .from("competition_participants")
    .select("cash_balance")
    .eq("id", order.participant_id)
    .single();

  if (!participant) return false;

  if (order.action === "buy") {
    if (participant.cash_balance < total) return false;

    // Deduct cash
    await db
      .from("competition_participants")
      .update({ cash_balance: participant.cash_balance - total })
      .eq("id", order.participant_id);

    // Upsert holding
    const { data: existing } = await db
      .from("holdings")
      .select("shares, avg_cost")
      .eq("participant_id", order.participant_id)
      .eq("symbol", order.symbol)
      .single();

    const currentShares = existing?.shares ?? 0;
    const newShares = currentShares + order.shares;
    const avgCost = currentShares === 0
      ? filledPrice
      : (currentShares * (existing?.avg_cost ?? filledPrice) + total) / newShares;

    await db.from("holdings").upsert(
      { participant_id: order.participant_id, symbol: order.symbol, shares: newShares, avg_cost: avgCost, updated_at: new Date().toISOString() },
      { onConflict: "participant_id,symbol" }
    );

  } else {
    // Sell
    const { data: holding } = await db
      .from("holdings")
      .select("shares, avg_cost")
      .eq("participant_id", order.participant_id)
      .eq("symbol", order.symbol)
      .single();

    if (!holding || holding.shares < order.shares) return false;

    // Add cash
    await db
      .from("competition_participants")
      .update({ cash_balance: participant.cash_balance + total })
      .eq("id", order.participant_id);

    // Update/delete holding
    const remaining = holding.shares - order.shares;
    if (remaining === 0) {
      await db.from("holdings").delete()
        .eq("participant_id", order.participant_id)
        .eq("symbol", order.symbol);
    } else {
      await db.from("holdings").update({ shares: remaining, updated_at: new Date().toISOString() })
        .eq("participant_id", order.participant_id)
        .eq("symbol", order.symbol);
    }
  }

  // Record trade
  await db.from("trades").insert({
    participant_id: order.participant_id,
    symbol: order.symbol,
    company_name: order.company_name,
    action: order.action,
    shares: order.shares,
    price: filledPrice,
    total,
  });

  // Mark order filled
  await db.from("limit_orders").update({
    status: "filled",
    filled_at: new Date().toISOString(),
    filled_price: filledPrice,
  }).eq("id", order.id);

  return true;
}

export async function GET() {
  try {
    const db = getAdminClient();

    // Get all pending orders
    const { data: orders } = await db
      .from("limit_orders")
      .select("*")
      .eq("status", "pending");

    if (!orders?.length) return NextResponse.json({ message: "No pending orders", filled: 0 });

    // Get current prices
    const { data: prices } = await db
      .from("stock_prices")
      .select("symbol, price");

    if (!prices?.length) return NextResponse.json({ message: "No price data", filled: 0 });

    const priceMap = Object.fromEntries(prices.map((p: { symbol: string; price: number }) => [p.symbol, p.price]));

    let filled = 0;

    for (const order of orders as LimitOrder[]) {
      const currentPrice = priceMap[order.symbol];
      if (currentPrice === undefined) continue;

      const triggered =
        (order.action === "buy"  && currentPrice <= order.target_price) ||
        (order.action === "sell" && currentPrice >= order.target_price);

      if (triggered) {
        const success = await executeTrade(db, order, currentPrice);
        if (success) filled++;
      }
    }

    return NextResponse.json({ success: true, filled });
  } catch (err) {
    console.error("Limit order execute error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
