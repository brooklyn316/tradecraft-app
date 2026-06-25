import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/aiRateLimit";

interface Bar { time: string; open: number; high: number; low: number; close: number; volume: number; }

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Technical helpers ─────────────────────────────────────────────────────

function sma(bars: Bar[], period: number): number {
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.close, 0) / slice.length;
}

function rsi(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function bollinger(bars: Bar[], period: number): { upper: number; middle: number; lower: number } {
  const slice = bars.slice(-period);
  const middle = slice.reduce((s, b) => s + b.close, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((s, b) => s + Math.pow(b.close - middle, 2), 0) / slice.length);
  return { upper: middle + 2 * std, middle, lower: middle - 2 * std };
}

// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  // Rate limit check
  const rateCheck = await checkRateLimit(req.headers.get("authorization"), "predict");
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.error, remaining: rateCheck.remaining }, { status: 429 });
  }

  try {
    const db = getSupabase();

    // Fetch cached 5-min candles from Supabase (no Alpha Vantage call needed)
    const { data: candleRows, error: candleErr } = await db
      .from("stock_candles")
      .select("time, open, high, low, close, volume")
      .eq("symbol", symbol)
      .eq("interval", "5min")
      .order("time", { ascending: true })
      .limit(150);

    if (candleErr) throw new Error(candleErr.message);

    // Also grab current price + today's change from stock_prices
    const { data: priceRow } = await db
      .from("stock_prices")
      .select("price, change_percent, company_name")
      .eq("symbol", symbol)
      .single();

    const bars: Bar[] = (candleRows ?? []).map(r => ({
      time: r.time as string,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume ?? 0),
    }));

    if (bars.length < 10) {
      return NextResponse.json({
        error: `Only ${bars.length} bars available for ${symbol}. View the chart first to cache price data, then try again.`,
      }, { status: 422 });
    }

    const latest     = bars[bars.length - 1];
    const prev       = bars[bars.length - 2];
    const currentPrice = priceRow?.price ?? latest.close;
    const todayChange  = priceRow?.change_percent ?? ((latest.close - prev.close) / prev.close) * 100;

    // Indicator periods scaled to available bars
    const n    = bars.length;
    const p5   = Math.min(5,  n);
    const p20  = Math.min(20, n);
    const p50  = Math.min(50, n);
    const pRsi = Math.min(14, n - 1);

    const sma5Val  = sma(bars, p5);
    const sma20Val = sma(bars, p20);
    const sma50Val = sma(bars, p50);
    const rsiVal   = rsi(bars, pRsi);
    const bb       = bollinger(bars, p20);

    // Momentum: compare now to bar N periods ago
    const momentum12 = ((latest.close - bars[Math.max(0, n - 13)].close) / bars[Math.max(0, n - 13)].close) * 100; // ~1h
    const momentum48 = ((latest.close - bars[Math.max(0, n - 49)].close) / bars[Math.max(0, n - 49)].close) * 100; // ~4h

    // Volume trend
    const vol10  = bars.slice(-10).reduce((s, b) => s + b.volume, 0) / 10;
    const vol50  = bars.slice(-Math.min(50, n)).reduce((s, b) => s + b.volume, 0) / Math.min(50, n);
    const volTrend = vol50 > 0 ? ((vol10 - vol50) / vol50) * 100 : 0;

    // Session high/low
    const sessionHigh = Math.max(...bars.map(b => b.high));
    const sessionLow  = Math.min(...bars.map(b => b.low));

    // BB position (0 = at lower band, 100 = at upper)
    const bbRange = bb.upper - bb.lower;
    const bbPos   = bbRange > 0 ? ((latest.close - bb.lower) / bbRange) * 100 : 50;

    // Build a compact price timeline (last 20 bars — every 6th label for readability)
    const timeline = bars.slice(-20).map((b, i) =>
      i % 4 === 0 ? `${b.time.slice(11, 16)}: $${b.close.toFixed(2)}` : null
    ).filter(Boolean).join("  |  ");

    const prompt = `You are a technical analysis engine for a stock market trading game. Analyse ${symbol}${priceRow?.company_name ? ` (${priceRow.company_name})` : ""} using intraday 5-minute bar data and give a short-term prediction for the next trading session or two.

CURRENT STATE:
- Price: $${currentPrice.toFixed(2)} | Today's change: ${todayChange >= 0 ? "+" : ""}${todayChange.toFixed(2)}%
- Bars analysed: ${n} × 5-min (covering ~${Math.round(n * 5 / 60)} hours of trading)

MOVING AVERAGES:
- SMA5:  $${sma5Val.toFixed(2)}  | Price ${latest.close > sma5Val ? "ABOVE" : "BELOW"} SMA5 by ${Math.abs(((latest.close - sma5Val) / sma5Val) * 100).toFixed(2)}%
- SMA20: $${sma20Val.toFixed(2)} | Price ${latest.close > sma20Val ? "ABOVE" : "BELOW"} SMA20 by ${Math.abs(((latest.close - sma20Val) / sma20Val) * 100).toFixed(2)}%
- SMA50: $${sma50Val.toFixed(2)} | SMA5 ${sma5Val > sma20Val ? ">" : "<"} SMA20 → ${sma5Val > sma20Val ? "bullish crossover" : "bearish crossover"}

MOMENTUM:
- Last ~1h: ${momentum12 >= 0 ? "+" : ""}${momentum12.toFixed(2)}%
- Last ~4h: ${momentum48 >= 0 ? "+" : ""}${momentum48.toFixed(2)}%

OSCILLATORS:
- RSI(${pRsi}): ${rsiVal.toFixed(1)} — ${rsiVal > 70 ? "overbought ⚠" : rsiVal < 30 ? "oversold ⚠" : "neutral zone"}
- Bollinger position: ${bbPos.toFixed(0)}% (0=lower band, 100=upper band)
- BB Upper: $${bb.upper.toFixed(2)} | Mid: $${bb.middle.toFixed(2)} | Lower: $${bb.lower.toFixed(2)}

RANGE & VOLUME:
- Session high: $${sessionHigh.toFixed(2)} | Session low: $${sessionLow.toFixed(2)}
- Price position in session range: ${(((latest.close - sessionLow) / (sessionHigh - sessionLow)) * 100).toFixed(0)}%
- Volume trend (recent vs avg): ${volTrend >= 0 ? "+" : ""}${volTrend.toFixed(1)}% ${volTrend > 20 ? "↑ rising volume" : volTrend < -20 ? "↓ fading volume" : "→ steady volume"}

RECENT PRICE ACTION (last 20 bars):
${timeline}

Respond ONLY with valid JSON — no markdown fences, no text outside the JSON object:
{
  "direction": "UP" | "DOWN" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "timeframe": "Next 1–2 sessions",
  "targetLow": <realistic low price as a number>,
  "targetHigh": <realistic high price as a number>,
  "signals": [
    "<signal 1 — concise, e.g. 'RSI at 71 — overbought, pullback likely'>",
    "<signal 2>",
    "<signal 3>",
    "<signal 4 — optional>"
  ],
  "summary": "<2–3 plain-English sentences summarising the trend, key level to watch, and what would change the outlook>"
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeJson = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claudeJson.error?.message ?? "Claude API error");

    const raw = (claudeJson.content?.[0]?.text ?? "")
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const prediction = JSON.parse(raw);

    return NextResponse.json({
      symbol,
      ...prediction,
      barsUsed: n,
      generatedAt: new Date().toISOString(),
      remaining: rateCheck.remaining,
    });

  } catch (err) {
    console.error("Predict error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
