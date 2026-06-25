import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// Bot only trades if its last trade was more than this many minutes ago
const BOT_COOLDOWN_MINUTES = 20;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  return createClient(url, key, { auth: { persistSession: false } });
}

interface StockPrice { symbol: string; company_name: string | null; price: number; change_percent: number | null; }
interface Holding    { id: string; participant_id: string; symbol: string; shares: number; avg_cost: number; }
interface Participant { id: string; competition_id: string; cash_balance: number; bot_strategy: string | null; }

async function executeBotTrade(
  db: DB,
  participantId: string,
  symbol: string,
  companyName: string,
  action: "buy" | "sell",
  shares: number,
  price: number,
  currentCash: number,
  currentShares: number
) {
  const total = shares * price;
  if (action === "buy") {
    if (currentCash < total) return;
    await db.from("competition_participants").update({ cash_balance: currentCash - total }).eq("id", participantId);
    const newShares = currentShares + shares;
    const avgCost = currentShares === 0 ? price : ((currentShares * price) + total) / newShares;
    await db.from("holdings").upsert(
      { participant_id: participantId, symbol, shares: newShares, avg_cost: avgCost, updated_at: new Date().toISOString() },
      { onConflict: "participant_id,symbol" }
    );
  } else {
    if (currentShares < shares) return;
    await db.from("competition_participants").update({ cash_balance: currentCash + total }).eq("id", participantId);
    if (currentShares - shares === 0) {
      await db.from("holdings").delete().eq("participant_id", participantId).eq("symbol", symbol);
    } else {
      await db.from("holdings").update({ shares: currentShares - shares, updated_at: new Date().toISOString() })
        .eq("participant_id", participantId).eq("symbol", symbol);
    }
  }
  await db.from("trades").insert({ participant_id: participantId, symbol, company_name: companyName, action, shares, price, total });
}

// ── Index Bot: rebalances into 5 blue-chips evenly ──
async function runIndexBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const targets = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  const holdingMap = Object.fromEntries(holdings.map(h => [h.symbol, h]));

  const holdingsValue = holdings.reduce((s, h) => s + h.shares * (priceMap[h.symbol]?.price ?? h.avg_cost), 0);
  const totalValue = participant.cash_balance + holdingsValue;
  const targetPerStock = totalValue / targets.length;

  let cash = participant.cash_balance;

  // Step 1: sell anything that's overweight by more than one share
  for (const sym of targets) {
    const sp = priceMap[sym];
    if (!sp) continue;
    const holding = holdingMap[sym];
    if (!holding || holding.shares === 0) continue;
    const currentValue = holding.shares * sp.price;
    const diff = targetPerStock - currentValue; // negative = overweight
    if (diff < -sp.price) {
      const shares = Math.min(Math.floor(-diff / sp.price), holding.shares);
      if (shares > 0) {
        await executeBotTrade(db, participant.id, sym, sp.company_name ?? sym, "sell", shares, sp.price, cash, holding.shares);
        cash += shares * sp.price;
      }
    }
  }

  // Step 2: deploy any idle cash (>3% of portfolio) into the most underweight target
  const idleCashThreshold = totalValue * 0.03;
  if (cash > idleCashThreshold) {
    // Find the most underweight target we can afford at least 1 share of
    const underweightTargets = targets
      .map(sym => {
        const sp = priceMap[sym];
        if (!sp || sp.price <= 0 || sp.price > cash) return null;
        const holding = holdingMap[sym];
        const currentValue = holding ? holding.shares * sp.price : 0;
        return { sym, sp, holding, gap: targetPerStock - currentValue };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.gap > 0)
      .sort((a, b) => b.gap - a.gap);

    for (const { sym, sp, holding, gap } of underweightTargets) {
      // Buy as many shares as needed to close the gap, up to available cash
      const sharesToClose = Math.floor(gap / sp.price);
      const affordableShares = Math.floor(cash / sp.price);
      const shares = Math.min(sharesToClose > 0 ? sharesToClose : 1, affordableShares);
      if (shares > 0 && cash >= shares * sp.price) {
        await executeBotTrade(db, participant.id, sym, sp.company_name ?? sym, "buy", shares, sp.price, cash, holding?.shares ?? 0);
        cash -= shares * sp.price;
        if (cash <= idleCashThreshold) break;
      }
    }
  }
}

// ── Momentum Bot: chases gainers, cuts losers ──
async function runMomentumBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  let cash = participant.cash_balance;

  // Sell holdings down more than 2% today
  for (const holding of holdings) {
    const sp = priceMap[holding.symbol];
    if (sp && (sp.change_percent ?? 0) < -2 && holding.shares > 0) {
      await executeBotTrade(db, participant.id, holding.symbol, sp.company_name ?? holding.symbol, "sell", holding.shares, sp.price, cash, holding.shares);
      cash += holding.shares * sp.price;
    }
  }

  // Buy top 2 gainers today (skip ones already held heavily)
  const heldSymbols = new Set(holdings.map(h => h.symbol));
  const gainers = [...prices]
    .filter(p => (p.change_percent ?? 0) > 1 && p.price > 0)
    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0))
    .slice(0, 3);

  const cashPerBuy = cash * 0.35;
  let bought = 0;
  for (const g of gainers) {
    if (bought >= 2) break;
    if (cashPerBuy < g.price) continue;
    const shares = Math.floor(cashPerBuy / g.price);
    if (shares < 1) continue;
    const existing = holdings.find(h => h.symbol === g.symbol);
    await executeBotTrade(db, participant.id, g.symbol, g.company_name ?? g.symbol, "buy", shares, g.price, cash, existing?.shares ?? 0);
    cash -= shares * g.price;
    bought++;
  }
}

// ── Chaos Bot: random moves ──
async function runChaosBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const roll = Math.random();
  if (roll < 0.35) return; // 35% chance: do nothing

  const cash = participant.cash_balance;

  if (roll < 0.65 || holdings.length === 0) {
    // Buy a random stock
    const pool = prices.filter(p => p.price > 0 && p.price < cash * 0.4);
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const maxSpend = cash * (0.05 + Math.random() * 0.15);
    const shares = Math.max(1, Math.floor(maxSpend / pick.price));
    if (cash >= shares * pick.price) {
      const existing = holdings.find(h => h.symbol === pick.symbol);
      await executeBotTrade(db, participant.id, pick.symbol, pick.company_name ?? pick.symbol, "buy", shares, pick.price, cash, existing?.shares ?? 0);
    }
  } else {
    // Sell part of a random holding
    const holding = holdings[Math.floor(Math.random() * holdings.length)];
    const sp = prices.find(p => p.symbol === holding.symbol);
    if (!sp || holding.shares < 1) return;
    const sharesToSell = Math.max(1, Math.floor(holding.shares * (0.25 + Math.random() * 0.5)));
    await executeBotTrade(db, participant.id, holding.symbol, sp.company_name ?? holding.symbol, "sell", sharesToSell, sp.price, cash, holding.shares);
  }
}

export async function GET() {
  try {
    const db = getAdminClient();

    // Get active competitions
    const { data: competitions, error: compError } = await db
      .from("competitions")
      .select("id")
      .eq("status", "active");
    if (compError) throw compError;
    if (!competitions?.length) return NextResponse.json({ message: "No active competitions" });

    // Refresh prices via edge function so bots always trade on fresh data
    const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stock-prices`
      : null;
    if (edgeUrl) {
      const allSymbols = ["AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","AMD","NFLX","JPM",
        "V","MA","JNJ","PFE","XOM","CVX","WMT","KO","PYPL","COIN","SPY","QQQ","RIVN","SNAP","UBER"];
      try {
        await fetch(edgeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: allSymbols }),
        });
      } catch (_) { /* non-fatal — fall through to cached prices */ }
    }

    // Get stock prices (now refreshed)
    const { data: prices, error: priceError } = await db.from("stock_prices").select("symbol, company_name, price, change_percent");
    if (priceError) throw priceError;
    const stockPrices: StockPrice[] = prices ?? [];
    if (!stockPrices.length) return NextResponse.json({ message: "No stock prices available" });

    let tradesExecuted = 0;

    for (const comp of competitions) {
      // Get bot participants
      const { data: bots } = await db
        .from("competition_participants")
        .select("id, competition_id, cash_balance, bot_strategy")
        .eq("competition_id", comp.id)
        .eq("is_bot", true);

      if (!bots?.length) continue;

      for (const bot of bots as Participant[]) {
        // Cooldown: skip if traded recently
        const { data: lastTrade } = await db
          .from("trades")
          .select("executed_at")
          .eq("participant_id", bot.id)
          .order("executed_at", { ascending: false })
          .limit(1)
          .single();

        if (lastTrade?.executed_at) {
          const minsAgo = (Date.now() - new Date(lastTrade.executed_at).getTime()) / 60000;
          if (minsAgo < BOT_COOLDOWN_MINUTES) continue;
        }

        // Get bot holdings
        const { data: holdings } = await db
          .from("holdings")
          .select("id, participant_id, symbol, shares, avg_cost")
          .eq("participant_id", bot.id);

        const botHoldings: Holding[] = holdings ?? [];

        try {
          switch (bot.bot_strategy) {
            case "index":    await runIndexBot(db, bot, botHoldings, stockPrices); break;
            case "momentum": await runMomentumBot(db, bot, botHoldings, stockPrices); break;
            case "random":   await runChaosBot(db, bot, botHoldings, stockPrices); break;
          }
          tradesExecuted++;
        } catch (err) {
          console.error(`Bot ${bot.id} (${bot.bot_strategy}) error:`, err);
        }
      }
    }

    return NextResponse.json({ success: true, tradesExecuted });
  } catch (err) {
    console.error("Bot trade error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
