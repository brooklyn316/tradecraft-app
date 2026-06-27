import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradecraftApp/1.0)" },
    });
    if (!res.ok) return NextResponse.json({ error: "Symbol not found" }, { status: 404 });

    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return NextResponse.json({ error: "Symbol not found" }, { status: 404 });

    const price      = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const prevClose  = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const changeAmt  = price - prevClose;
    const changePct  = prevClose > 0 ? (changeAmt / prevClose) * 100 : 0;

    return NextResponse.json({
      symbol,
      company_name:   meta.shortName ?? meta.longName ?? symbol,
      price,
      open:           meta.regularMarketOpen ?? null,
      high:           meta.regularMarketDayHigh ?? null,
      low:            meta.regularMarketDayLow ?? null,
      prev_close:     prevClose,
      change_amount:  changeAmt,
      change_percent: changePct,
      volume:         meta.regularMarketVolume ?? null,
      updated_at:     new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
