import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradecraftApp/1.0)" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = await res.json();

    const results = (data.quotes ?? [])
      .filter((item: any) =>
        item.quoteType === "EQUITY" &&
        item.symbol &&
        !item.symbol.includes(".") // skip non-US listings like BHP.AX
      )
      .slice(0, 8)
      .map((item: any) => ({
        symbol:   item.symbol as string,
        name:     (item.shortname ?? item.longname ?? item.symbol) as string,
        exchange: (item.exchange ?? "") as string,
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
