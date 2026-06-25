import { NextRequest, NextResponse } from "next/server";
import type { Holding, StockPrice, Trade } from "@/types";
import { checkRateLimit } from "@/lib/aiRateLimit";

interface AdvisorRequest {
  holdings: Holding[];
  cashBalance: number;
  stocks: StockPrice[];
  recentTrades: Trade[];
  startingCash: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 500 }
    );
  }

  // Rate limit check
  const rateCheck = await checkRateLimit(req.headers.get("authorization"), "advisor");
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.error, remaining: rateCheck.remaining }, { status: 429 });
  }

  let body: AdvisorRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { holdings, cashBalance, stocks, recentTrades, startingCash } = body;

  // Build price lookup
  const priceMap = Object.fromEntries(stocks.map((s) => [s.symbol, s]));

  // Calculate total portfolio value
  const holdingsValue = holdings.reduce((sum, h) => {
    const price = priceMap[h.symbol]?.price ?? h.avg_cost;
    return sum + h.shares * price;
  }, 0);
  const totalValue = cashBalance + holdingsValue;
  const returnPct = ((totalValue - startingCash) / startingCash) * 100;

  // Build holdings summary
  const holdingsSummary =
    holdings.length === 0
      ? "No positions. All cash."
      : holdings
          .map((h) => {
            const sp = priceMap[h.symbol];
            const price = sp?.price ?? h.avg_cost;
            const pnl = (price - h.avg_cost) * h.shares;
            const pnlPct = ((price - h.avg_cost) / h.avg_cost) * 100;
            const alloc = ((h.shares * price) / totalValue) * 100;
            return `- ${h.symbol} (${sp?.company_name ?? ""}): ${h.shares} shares, avg cost $${h.avg_cost.toFixed(2)}, now $${price.toFixed(2)}, P&L ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% ($${pnl.toFixed(2)}), ${alloc.toFixed(1)}% of portfolio`;
          })
          .join("\n");

  // Build market snapshot (top movers)
  const sorted = [...stocks].sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0));
  const marketSnapshot = sorted
    .slice(0, 15)
    .map((s) => `- ${s.symbol} (${s.company_name}): $${s.price.toFixed(2)}, ${(s.change_percent ?? 0) >= 0 ? "+" : ""}${(s.change_percent ?? 0).toFixed(2)}% today`)
    .join("\n");

  // Recent trades summary
  const tradesSummary =
    recentTrades.length === 0
      ? "No trades made yet."
      : recentTrades
          .slice(0, 10)
          .map((t) => `- ${t.action.toUpperCase()} ${t.shares} ${t.symbol} @ $${t.price.toFixed(2)} (total $${t.total.toFixed(2)})`)
          .join("\n");

  const prompt = `You are a sharp, direct AI trading advisor inside Tradecraft — a stock market game where players start with $10,000 virtual cash and compete to grow it.

PLAYER'S PORTFOLIO:
- Total value: $${totalValue.toFixed(2)} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}% return from $${startingCash.toFixed(2)} starting cash)
- Cash available: $${cashBalance.toFixed(2)} (${((cashBalance / totalValue) * 100).toFixed(0)}% of portfolio)
- Holdings value: $${holdingsValue.toFixed(2)}

HOLDINGS:
${holdingsSummary}

RECENT TRADES:
${tradesSummary}

MARKET TODAY (biggest movers):
${marketSnapshot}

Give 4 specific, actionable recommendations. Be direct — name actual stocks, suggest amounts, and explain the logic concisely. Consider: portfolio concentration risk, cash deployment opportunities, cut losses vs hold, and momentum plays.

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "summary": "2-sentence honest assessment of where they stand and the key risk or opportunity right now",
  "suggestions": [
    {
      "action": "BUY" | "SELL" | "HOLD" | "DIVERSIFY",
      "symbol": "TICKER or null if general advice",
      "title": "Short punchy action title (max 8 words)",
      "reason": "2-3 sentences. Specific reasoning. Reference actual numbers from their portfolio.",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", errorText);
      return NextResponse.json({ error: "AI request failed", details: errorText }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ ...parsed, remaining: rateCheck.remaining });
  } catch (err) {
    console.error("Advisor error:", err);
    return NextResponse.json({ error: "Failed to generate advice" }, { status: 500 });
  }
}
