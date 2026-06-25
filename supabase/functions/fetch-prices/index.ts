// Supabase Edge Function: fetch-prices
// Fetches current price + daily history from Yahoo Finance (free, no key needed).
// Upserts into stock_prices and stock_price_history tables.
//
// Deploy: supabase functions deploy fetch-prices
// Invoke: POST /functions/v1/fetch-prices
//         Body: { "symbols": ["AAPL", "MSFT"] }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Yahoo Finance v8 chart endpoint — no API key required
function yahooChartUrl(symbol: string, range = "5d", interval = "1d") {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;
}

// Yahoo Finance quote summary — for 52-week high/low, company name
function yahooQuoteUrl(symbol: string) {
  return `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,price`;
}

interface PriceRow {
  symbol: string;
  company_name: string | null;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  change_amount: number | null;
  change_percent: number | null;
  volume: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  updated_at: string;
}

interface HistoryRow {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const symbols: string[] = (body.symbols ?? []).map((s: string) => s.toUpperCase());

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: "symbols array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, unknown> = {};

    for (const symbol of symbols) {
      try {
        // Fetch 30-day daily chart (gives us current price + recent history)
        const chartRes = await fetch(yahooChartUrl(symbol, "30d", "1d"), {
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (!chartRes.ok) {
          results[symbol] = { error: `Yahoo chart fetch failed: ${chartRes.status}` };
          continue;
        }

        const chartData = await chartRes.json();
        const chart = chartData?.chart?.result?.[0];

        if (!chart) {
          results[symbol] = { error: "No chart data returned" };
          continue;
        }

        const meta = chart.meta;
        const timestamps: number[] = chart.timestamp ?? [];
        const ohlcv = chart.indicators?.quote?.[0] ?? {};

        const opens: number[]   = ohlcv.open   ?? [];
        const highs: number[]   = ohlcv.high   ?? [];
        const lows: number[]    = ohlcv.low    ?? [];
        const closes: number[]  = ohlcv.close  ?? [];
        const volumes: number[] = ohlcv.volume ?? [];

        // Current price from meta (most up-to-date during market hours)
        const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1];
        const prevClose    = meta.chartPreviousClose ?? meta.previousClose;
        const changeAmt    = prevClose ? currentPrice - prevClose : null;
        const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : null;

        // Today's OHLCV from meta
        const todayOpen   = meta.regularMarketOpen ?? opens[opens.length - 1] ?? null;
        const todayHigh   = meta.regularMarketDayHigh ?? highs[highs.length - 1] ?? null;
        const todayLow    = meta.regularMarketDayLow ?? lows[lows.length - 1] ?? null;
        const todayVolume = meta.regularMarketVolume ?? volumes[volumes.length - 1] ?? null;

        // 52-week high/low from meta
        const week52High = meta.fiftyTwoWeekHigh ?? null;
        const week52Low  = meta.fiftyTwoWeekLow ?? null;

        const priceRow: PriceRow = {
          symbol,
          company_name: meta.longName ?? meta.shortName ?? null,
          price: currentPrice,
          open: todayOpen,
          high: todayHigh,
          low: todayLow,
          prev_close: prevClose ?? null,
          change_amount: changeAmt,
          change_percent: changePct,
          volume: todayVolume,
          week_52_high: week52High,
          week_52_low: week52Low,
          updated_at: new Date().toISOString(),
        };

        // Upsert current price
        await supabase.from("stock_prices").upsert(priceRow, { onConflict: "symbol" });

        // Build daily history rows (skip today — it's intraday, not final close)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const historyRows: HistoryRow[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const ts = new Date(timestamps[i] * 1000);
          ts.setHours(0, 0, 0, 0);
          if (ts >= today) continue; // skip today's partial candle

          const c = closes[i];
          const o = opens[i];
          const h = highs[i];
          const l = lows[i];
          if (c == null || o == null || h == null || l == null) continue;

          historyRows.push({
            symbol,
            date: ts.toISOString().split("T")[0],
            open: o,
            high: h,
            low: l,
            close: c,
            volume: volumes[i] ?? null,
          });
        }

        if (historyRows.length > 0) {
          await supabase
            .from("stock_price_history")
            .upsert(historyRows, { onConflict: "symbol,date" });
        }

        results[symbol] = { ...priceRow, historyDays: historyRows.length };

      } catch (err) {
        results[symbol] = { error: (err as Error).message };
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
