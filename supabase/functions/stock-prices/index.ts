// Supabase Edge Function: stock-prices
// Fetches from Alpha Vantage, caches in Supabase, respects rate limits.
//
// Deploy: supabase functions deploy stock-prices
// Invoke:  POST /functions/v1/stock-prices
//          Body: { "symbol": "AAPL", "interval": "5min" }
//          Or:   { "symbols": ["AAPL","MSFT"], "interval": "5min" }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cache TTL in seconds — free tier can do ~25/day, so cache aggressively
const PRICE_CACHE_TTL = 60;        // 60s for current price
const CANDLE_CACHE_TTL = 5 * 60;  // 5min for OHLCV

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const symbols: string[] = body.symbols ?? (body.symbol ? [body.symbol] : []);
    const interval: string = body.interval ?? "5min"; // 5min | 15min | 60min | 1day

    if (symbols.length === 0) {
      return new Response(JSON.stringify({ error: "symbol or symbols required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown> = {};

    for (const symbol of symbols.map((s) => s.toUpperCase())) {
      try {
        // 1. Check price cache
        const { data: cached } = await supabase
          .from("stock_prices")
          .select("*")
          .eq("symbol", symbol)
          .single();

        const cacheAge = cached
          ? (Date.now() - new Date(cached.updated_at).getTime()) / 1000
          : Infinity;

        // 2. Return cached if fresh
        if (cached && cacheAge < PRICE_CACHE_TTL) {
          results[symbol] = { ...cached, fromCache: true };
          continue;
        }

        // 3. Fetch from Alpha Vantage — GLOBAL_QUOTE for current price
        const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
        const quoteRes = await fetch(quoteUrl);
        const quoteData = await quoteRes.json();
        const q = quoteData["Global Quote"];

        if (!q || !q["05. price"]) {
          // API limit hit or bad symbol — return cached data if available
          if (cached) {
            results[symbol] = { ...cached, fromCache: true, stale: true };
          } else {
            results[symbol] = { error: "No data available", symbol };
          }
          continue;
        }

        const priceRow = {
          symbol,
          price: parseFloat(q["05. price"]),
          open: parseFloat(q["02. open"]),
          high: parseFloat(q["03. high"]),
          low: parseFloat(q["04. low"]),
          prev_close: parseFloat(q["08. previous close"]),
          change_amount: parseFloat(q["09. change"]),
          change_percent: parseFloat(q["10. change percent"].replace("%", "")),
          volume: parseInt(q["06. volume"]),
          updated_at: new Date().toISOString(),
        };

        // 4. Upsert to cache
        await supabase.from("stock_prices").upsert(priceRow);
        results[symbol] = { ...priceRow, fromCache: false };

        // 5. Fetch OHLCV candles if interval requested
        await fetchCandles(supabase, symbol, interval);

      } catch (err) {
        results[symbol] = { error: (err as Error).message };
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchCandles(
  supabase: ReturnType<typeof createClient>,
  symbol: string,
  interval: string
) {
  // Check candle cache freshness
  const { data: latestCandle } = await supabase
    .from("stock_candles")
    .select("time")
    .eq("symbol", symbol)
    .eq("interval", interval)
    .order("time", { ascending: false })
    .limit(1)
    .single();

  const cacheAge = latestCandle
    ? (Date.now() - new Date(latestCandle.time).getTime()) / 1000
    : Infinity;

  if (cacheAge < CANDLE_CACHE_TTL) return;

  // Map our interval to Alpha Vantage function
  const avFunction = interval === "1day"
    ? "TIME_SERIES_DAILY"
    : "TIME_SERIES_INTRADAY";

  let url = `https://www.alphavantage.co/query?function=${avFunction}&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}&outputsize=compact`;
  if (avFunction === "TIME_SERIES_INTRADAY") {
    url += `&interval=${interval}`;
  }

  const res = await fetch(url);
  const data = await res.json();

  const seriesKey = interval === "1day"
    ? "Time Series (Daily)"
    : `Time Series (${interval})`;

  const series = data[seriesKey];
  if (!series) return;

  const candles = Object.entries(series).map(([time, values]: [string, unknown]) => {
    const v = values as Record<string, string>;
    return {
      symbol,
      interval,
      time: new Date(time).toISOString(),
      open: parseFloat(v["1. open"]),
      high: parseFloat(v["2. high"]),
      low: parseFloat(v["3. low"]),
      close: parseFloat(v["4. close"]),
      volume: parseInt(v["5. volume"]),
    };
  });

  if (candles.length > 0) {
    await supabase
      .from("stock_candles")
      .upsert(candles, { onConflict: "symbol,interval,time" });
  }
}
