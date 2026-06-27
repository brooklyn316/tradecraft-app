// Supabase Edge Function: stock-prices
// Yahoo Finance replacement for Alpha Vantage — no API key, no rate limits.
// Interface is identical to the old function so the front-end needs no changes.
//
// POST /functions/v1/stock-prices
// Body: { "symbols": ["AAPL"], "interval": "5min", "fetchCandles": true }
// Intervals: "5min" | "15min" | "60min" | "1day"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map our interval labels → Yahoo Finance params
const INTERVAL_MAP: Record<string, { yInterval: string; yRange: string }> = {
  "5min":  { yInterval: "5m",  yRange: "1d"  },
  "15min": { yInterval: "15m", yRange: "5d"  },
  "60min": { yInterval: "60m", yRange: "30d" },
  "1day":  { yInterval: "1d",  yRange: "3mo" },
};

function yahooChartUrl(symbol: string, yInterval: string, yRange: string) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${yRange}&interval=${yInterval}&includePrePost=false`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const symbols: string[] = (body.symbols ?? (body.symbol ? [body.symbol] : []))
      .map((s: string) => s.toUpperCase());
    const interval: string = body.interval ?? "5min";

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: "symbols array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const intervalCfg = INTERVAL_MAP[interval] ?? INTERVAL_MAP["5min"];
    const results: Record<string, unknown> = {};

    for (const symbol of symbols) {
      try {
        // Fetch chart data — gives us current price + OHLCV history in one call
        const chartRes = await fetch(
          yahooChartUrl(symbol, intervalCfg.yInterval, intervalCfg.yRange),
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );

        if (!chartRes.ok) {
          results[symbol] = { error: `Yahoo fetch failed: ${chartRes.status}` };
          continue;
        }

        const json = await chartRes.json();
        const chart = json?.chart?.result?.[0];

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

        // Current price
        const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
        const prevClose    = meta.chartPreviousClose ?? meta.previousClose ?? null;
        const changeAmt    = prevClose ? currentPrice - prevClose : null;
        const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : null;

        // Upsert stock_prices
        const priceRow = {
          symbol,
          company_name: meta.longName ?? meta.shortName ?? null,
          price: currentPrice,
          open: meta.regularMarketOpen ?? opens[opens.length - 1] ?? null,
          high: meta.regularMarketDayHigh ?? highs[highs.length - 1] ?? null,
          low: meta.regularMarketDayLow ?? lows[lows.length - 1] ?? null,
          prev_close: prevClose,
          change_amount: changeAmt,
          change_percent: changePct,
          volume: meta.regularMarketVolume ?? volumes[volumes.length - 1] ?? null,
          week_52_high: meta.fiftyTwoWeekHigh ?? null,
          week_52_low: meta.fiftyTwoWeekLow ?? null,
          updated_at: new Date().toISOString(),
        };

        await supabase.from("stock_prices").upsert(priceRow, { onConflict: "symbol" });

        // Upsert stock_candles
        const candleRows: Array<{
          symbol: string; interval: string; time: string;
          open: number; high: number; low: number; close: number; volume: number | null;
        }> = [];

        for (let i = 0; i < timestamps.length; i++) {
          const o = opens[i];
          const h = highs[i];
          const l = lows[i];
          const c = closes[i];
          if (o == null || h == null || l == null || c == null) continue;

          candleRows.push({
            symbol,
            interval,
            time: new Date(timestamps[i] * 1000).toISOString(),
            open: o,
            high: h,
            low: l,
            close: c,
            volume: volumes[i] ?? null,
          });
        }

        if (candleRows.length > 0) {
          await supabase
            .from("stock_candles")
            .upsert(candleRows, { onConflict: "symbol,interval,time" });
        }

        results[symbol] = { ...priceRow, candlesInserted: candleRows.length, fromCache: false };

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
