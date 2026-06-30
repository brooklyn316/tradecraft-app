import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface RawTrade {
  id:           string;
  symbol:       string;
  action:       "buy" | "sell";
  shares:       number;
  price:        number;
  total:        number;
  executed_at:  string;
}

interface RawHolding {
  symbol:   string;
  shares:   number;
  avg_cost: number;
}

// ── GET /api/trade-journal?participantId=<id> ─────────────────────────────
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  const db = getAdminClient();

  const [{ data: trades }, { data: holdings }] = await Promise.all([
    db.from("trades")
      .select("id, symbol, action, shares, price, total, executed_at")
      .eq("participant_id", participantId)
      .order("executed_at", { ascending: true }),
    db.from("holdings")
      .select("symbol, shares, avg_cost")
      .eq("participant_id", participantId),
  ]);

  const allTrades: RawTrade[]   = trades   ?? [];
  const allHoldings: RawHolding[] = holdings ?? [];

  if (allTrades.length === 0) {
    return NextResponse.json({
      summary:  null,
      bySymbol: [],
      trades:   [],
    });
  }

  // ── Per-symbol analysis using FIFO cost tracking ──────────────────────────
  // costQueue[symbol] = [{price, shares}] in FIFO order
  const costQueue: Record<string, { price: number; shares: number }[]> = {};
  const realizedPnLBySymbol: Record<string, number> = {};
  const totalBoughtBySymbol: Record<string, number> = {};
  const totalSoldBySymbol:   Record<string, number> = {};
  const tradeCountBySymbol:  Record<string, number> = {};
  const sellPnLList: { symbol: string; pnl: number; executed_at: string }[] = [];

  const annotatedTrades: (RawTrade & { tradeRealizedPnL?: number })[] = [];

  for (const t of allTrades) {
    const sym = t.symbol;
    if (!costQueue[sym])          costQueue[sym] = [];
    if (!realizedPnLBySymbol[sym]) realizedPnLBySymbol[sym] = 0;
    if (!totalBoughtBySymbol[sym]) totalBoughtBySymbol[sym] = 0;
    if (!totalSoldBySymbol[sym])   totalSoldBySymbol[sym] = 0;
    tradeCountBySymbol[sym] = (tradeCountBySymbol[sym] ?? 0) + 1;

    if (t.action === "buy") {
      costQueue[sym].push({ price: t.price, shares: t.shares });
      totalBoughtBySymbol[sym] += t.total;
      annotatedTrades.push({ ...t });
    } else {
      // FIFO sell
      totalSoldBySymbol[sym] += t.total;
      let remaining = t.shares;
      let costBasis = 0;
      while (remaining > 0 && costQueue[sym].length > 0) {
        const lot = costQueue[sym][0];
        const consumed = Math.min(remaining, lot.shares);
        costBasis += consumed * lot.price;
        lot.shares -= consumed;
        remaining  -= consumed;
        if (lot.shares === 0) costQueue[sym].shift();
      }
      const pnl = t.total - costBasis;
      realizedPnLBySymbol[sym] += pnl;
      sellPnLList.push({ symbol: sym, pnl, executed_at: t.executed_at });
      annotatedTrades.push({ ...t, tradeRealizedPnL: pnl });
    }
  }

  // Fetch current prices for open holdings
  const heldSymbols = allHoldings.map(h => h.symbol);
  let priceMap: Record<string, number> = {};
  if (heldSymbols.length > 0) {
    const { data: prices } = await db
      .from("stock_prices")
      .select("symbol, price")
      .in("symbol", heldSymbols);
    for (const p of (prices ?? [])) priceMap[p.symbol] = p.price;
  }

  // Unrealized P&L for open positions
  const unrealizedBySymbol: Record<string, number> = {};
  for (const h of allHoldings) {
    const currentPrice = priceMap[h.symbol] ?? h.avg_cost;
    unrealizedBySymbol[h.symbol] = (currentPrice - h.avg_cost) * h.shares;
  }

  // ── Build bySymbol summary ─────────────────────────────────────────────────
  const allSymbols = [...new Set(allTrades.map(t => t.symbol))];
  const bySymbol = allSymbols.map(sym => {
    const holding = allHoldings.find(h => h.symbol === sym);
    return {
      symbol:       sym,
      tradeCount:   tradeCountBySymbol[sym] ?? 0,
      totalBought:  totalBoughtBySymbol[sym] ?? 0,
      totalSold:    totalSoldBySymbol[sym] ?? 0,
      realizedPnL:  realizedPnLBySymbol[sym] ?? 0,
      unrealizedPnL:unrealizedBySymbol[sym] ?? 0,
      sharesHeld:   holding?.shares ?? 0,
      avgCost:      holding?.avg_cost ?? 0,
      currentPrice: priceMap[sym] ?? 0,
    };
  }).sort((a, b) => (b.realizedPnL + b.unrealizedPnL) - (a.realizedPnL + a.unrealizedPnL));

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalRealizedPnL = Object.values(realizedPnLBySymbol).reduce((s, v) => s + v, 0);
  const totalUnrealizedPnL = Object.values(unrealizedBySymbol).reduce((s, v) => s + v, 0);
  const buys  = allTrades.filter(t => t.action === "buy");
  const sells = allTrades.filter(t => t.action === "sell");
  const winningSymbols = bySymbol.filter(s => (s.realizedPnL + s.unrealizedPnL) > 0).length;
  const losingSymbols  = bySymbol.filter(s => (s.realizedPnL + s.unrealizedPnL) < 0).length;

  const bestTrade  = sellPnLList.length ? [...sellPnLList].sort((a, b) => b.pnl - a.pnl)[0]  : null;
  const worstTrade = sellPnLList.length ? [...sellPnLList].sort((a, b) => a.pnl - b.pnl)[0] : null;

  const mostTradedSymbol = Object.entries(tradeCountBySymbol)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const totalVolume = allTrades.reduce((s, t) => s + t.total, 0);

  return NextResponse.json({
    summary: {
      totalTrades:       allTrades.length,
      totalBuys:         buys.length,
      totalSells:        sells.length,
      totalVolume,
      avgTradeSize:      allTrades.length ? totalVolume / allTrades.length : 0,
      realizedPnL:       totalRealizedPnL,
      unrealizedPnL:     totalUnrealizedPnL,
      winningSymbols,
      losingSymbols,
      symbolCount:       allSymbols.length,
      bestTrade,
      worstTrade,
      mostTradedSymbol,
    },
    bySymbol,
    trades: annotatedTrades,
  });
}
