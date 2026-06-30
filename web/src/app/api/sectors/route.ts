import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeSectorStats,
  computePlayerAllocation,
  computeRotationScore,
} from "@/lib/sectors";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── GET /api/sectors?participantId=<uuid> ─────────────────────────────────
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = getAdminClient();

  const { data: priceRows } = await db
    .from("stock_prices")
    .select("symbol, price, change_percent");

  const prices = priceRows ?? [];
  const sectorStats = computeSectorStats(prices);

  if (!participantId) {
    return NextResponse.json({ sectors: sectorStats, allocation: [], rotationScore: 0 });
  }

  const { data: holdings } = await db
    .from("holdings")
    .select("symbol, shares")
    .eq("participant_id", participantId);

  const priceMap = Object.fromEntries(prices.map((p: { symbol: string; price: number }) => [p.symbol, p.price]));
  const allocation    = computePlayerAllocation(holdings ?? [], priceMap);
  const rotationScore = computeRotationScore(allocation, sectorStats);

  return NextResponse.json({ sectors: sectorStats, allocation, rotationScore });
}
