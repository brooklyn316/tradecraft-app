import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── GET /api/market-wealth?userId=<uuid> ──────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const db = getAdminClient();

  const [{ data: wealth }, { data: txns }] = await Promise.all([
    db.from("market_wealth").select("balance, total_earned, updated_at").eq("user_id", userId).single(),
    db.from("market_wealth_transactions")
      .select("amount, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    balance:      wealth?.balance      ?? 0,
    total_earned: wealth?.total_earned ?? 0,
    transactions: txns ?? [],
  });
}
