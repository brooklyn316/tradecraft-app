import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  blackScholesPremium,
  timeToExpiryYears,
  CONTRACT_SIZE,
  totalPremiumCost,
} from "@/lib/options-pricing";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── POST /api/options — buy a call or put ─────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    participantId: string;
    competitionId: string;
    symbol: string;
    companyName?: string;
    optionType: "call" | "put";
    strike: number;
    expiry: string;      // "YYYY-MM-DD"
    contracts: number;   // whole number ≥ 1
  };

  const { participantId, competitionId, symbol, companyName, optionType, strike, expiry, contracts } = body;

  if (!participantId || !competitionId || !symbol || !optionType || !strike || !expiry || !contracts) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (contracts < 1 || contracts > 50) {
    return NextResponse.json({ error: "Contracts must be between 1 and 50" }, { status: 400 });
  }

  const T = timeToExpiryYears(expiry);
  if (T <= 0) {
    return NextResponse.json({ error: "Option has already expired" }, { status: 400 });
  }

  const db = getAdminClient();

  // Fetch current stock price
  const { data: sp } = await db
    .from("stock_prices")
    .select("price, company_name")
    .eq("symbol", symbol)
    .single();

  if (!sp) {
    return NextResponse.json({ error: "Stock price not found" }, { status: 404 });
  }

  // Compute premium
  const premiumPerShare = blackScholesPremium(sp.price, strike, T, optionType);
  const totalCost = totalPremiumCost(premiumPerShare, contracts);

  // Check participant cash
  const { data: participant } = await db
    .from("competition_participants")
    .select("cash_balance")
    .eq("id", participantId)
    .single();

  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }
  if (participant.cash_balance < totalCost) {
    return NextResponse.json({
      error: `Insufficient funds. Need $${totalCost.toFixed(2)}, have $${participant.cash_balance.toFixed(2)}`,
    }, { status: 400 });
  }

  // Deduct premium
  const { error: cashErr } = await db
    .from("competition_participants")
    .update({ cash_balance: participant.cash_balance - totalCost })
    .eq("id", participantId);

  if (cashErr) {
    return NextResponse.json({ error: cashErr.message }, { status: 500 });
  }

  // Insert option position
  const { data: position, error: posErr } = await db
    .from("option_positions")
    .insert({
      participant_id: participantId,
      competition_id: competitionId,
      symbol,
      company_name: companyName ?? sp.company_name ?? symbol,
      option_type: optionType,
      strike,
      expiry,
      contracts,
      premium_paid: premiumPerShare,
    })
    .select()
    .single();

  if (posErr) {
    // Refund if insert failed
    await db.from("competition_participants")
      .update({ cash_balance: participant.cash_balance })
      .eq("id", participantId);
    return NextResponse.json({ error: posErr.message }, { status: 500 });
  }

  return NextResponse.json({
    position,
    premiumPerShare,
    totalCost,
    contractSize: CONTRACT_SIZE,
    stockPrice: sp.price,
  });
}

// ── GET /api/options — fetch option chain for a symbol ────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const participantId = searchParams.get("participantId");

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const db = getAdminClient();

  const [{ data: sp }, { data: positions }] = await Promise.all([
    db.from("stock_prices").select("price, company_name").eq("symbol", symbol).single(),
    participantId
      ? db.from("option_positions").select("*").eq("participant_id", participantId).eq("symbol", symbol).eq("settled", false)
      : Promise.resolve({ data: [] }),
  ]);

  if (!sp) return NextResponse.json({ error: "Stock not found" }, { status: 404 });

  return NextResponse.json({ stockPrice: sp.price, companyName: sp.company_name, positions: positions ?? [] });
}
