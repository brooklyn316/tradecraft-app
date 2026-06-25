import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  try {
    const db = getAdminClient();

    // Participant info
    const { data: participant, error: pErr } = await db
      .from("competition_participants")
      .select("id, cash_balance, bot_strategy")
      .eq("id", participantId)
      .eq("is_bot", true)
      .single();
    if (pErr || !participant) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

    // Holdings
    const { data: holdings } = await db
      .from("holdings")
      .select("symbol, shares, avg_cost")
      .eq("participant_id", participantId);

    // Current prices for those holdings
    const symbols = (holdings ?? []).map((h: { symbol: string }) => h.symbol);
    const { data: prices } = symbols.length > 0
      ? await db.from("stock_prices").select("symbol, price, company_name, change_percent").in("symbol", symbols)
      : { data: [] };

    const priceMap = Object.fromEntries((prices ?? []).map((p: { symbol: string; price: number; company_name: string | null; change_percent: number | null }) => [p.symbol, p]));

    const enrichedHoldings = (holdings ?? []).map((h: { symbol: string; shares: number; avg_cost: number }) => {
      const sp = priceMap[h.symbol];
      const price = sp?.price ?? h.avg_cost;
      const marketValue = h.shares * price;
      const pnl = marketValue - h.shares * h.avg_cost;
      const pnlPct = ((price - h.avg_cost) / h.avg_cost) * 100;
      return {
        symbol: h.symbol,
        companyName: sp?.company_name ?? h.symbol,
        shares: h.shares,
        avgCost: h.avg_cost,
        price,
        marketValue,
        pnl,
        pnlPct,
        changePercent: sp?.change_percent ?? 0,
      };
    }).sort((a: { marketValue: number }, b: { marketValue: number }) => b.marketValue - a.marketValue);

    // Recent trades
    const { data: trades } = await db
      .from("trades")
      .select("symbol, action, shares, price, total, executed_at")
      .eq("participant_id", participantId)
      .order("executed_at", { ascending: false })
      .limit(15);

    const holdingsValue = enrichedHoldings.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0);

    return NextResponse.json({
      botStrategy: participant.bot_strategy,
      cashBalance: participant.cash_balance,
      holdingsValue,
      totalValue: participant.cash_balance + holdingsValue,
      holdings: enrichedHoldings,
      trades: trades ?? [],
    });
  } catch (err) {
    console.error("Bot inspect error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
