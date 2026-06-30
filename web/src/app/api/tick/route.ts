import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const TICK_SECRET = process.env.TICK_SECRET ?? "";
const BOT_COOLDOWN_MINUTES = 15;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Market hours check (9:30am–4:00pm ET, Mon–Fri) ──────────────────────────
function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

// ── Refresh stock prices via Edge Function ───────────────────────────────────
async function refreshPrices(db: DB): Promise<boolean> {
  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stock-prices`;
  const symbols = [
    "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","AMD","NFLX","JPM",
    "V","MA","JNJ","PFE","XOM","CVX","WMT","KO","PYPL","COIN",
    "SPY","QQQ","RIVN","SNAP","UBER","DIS","BABA","SHOP","SQ","PLTR",
    "BAC","GS","INTC","MU","ORCL","ADBE","CRM","HOOD","RBLX","SOFI",
    "NKE","SBUX","MCD","F","GM","BA","CAT","GE","MMM","T",
  ];
  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    return res.ok;
  } catch {
    // Fall through — bots will use cached prices
    return false;
  }
}

// ── Bot trading logic ────────────────────────────────────────────────────────
interface StockPrice { symbol: string; company_name: string | null; price: number; change_percent: number | null; }
interface Holding    { id: string; participant_id: string; symbol: string; shares: number; avg_cost: number; }
interface Participant { id: string; competition_id: string; cash_balance: number; bot_strategy: string | null; }

async function executeBotTrade(
  db: DB, participantId: string, symbol: string, companyName: string,
  action: "buy" | "sell", shares: number, price: number,
  currentCash: number, currentShares: number,
) {
  const total = shares * price;
  if (action === "buy") {
    if (currentCash < total) return;
    const newShares = currentShares + shares;
    const avgCost = currentShares === 0 ? price : ((currentShares * price) + total) / newShares;
    await db.from("competition_participants").update({ cash_balance: currentCash - total }).eq("id", participantId);
    await db.from("holdings").upsert(
      { participant_id: participantId, symbol, shares: newShares, avg_cost: avgCost, updated_at: new Date().toISOString() },
      { onConflict: "participant_id,symbol" },
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

async function runIndexBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const targets = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  const holdingMap = Object.fromEntries(holdings.map(h => [h.symbol, h]));
  const holdingsValue = holdings.reduce((s, h) => s + h.shares * (priceMap[h.symbol]?.price ?? h.avg_cost), 0);
  const totalValue = participant.cash_balance + holdingsValue;
  const targetPerStock = totalValue / targets.length;
  let cash = participant.cash_balance;

  for (const sym of targets) {
    const sp = priceMap[sym]; if (!sp) continue;
    const holding = holdingMap[sym];
    if (!holding || holding.shares === 0) continue;
    const diff = targetPerStock - holding.shares * sp.price;
    if (diff < -sp.price) {
      const shares = Math.min(Math.floor(-diff / sp.price), holding.shares);
      if (shares > 0) { await executeBotTrade(db, participant.id, sym, sp.company_name ?? sym, "sell", shares, sp.price, cash, holding.shares); cash += shares * sp.price; }
    }
  }
  const idleThreshold = totalValue * 0.03;
  if (cash > idleThreshold) {
    const candidates = targets.map(sym => {
      const sp = priceMap[sym]; if (!sp || sp.price <= 0 || sp.price > cash) return null;
      const holding = holdingMap[sym];
      return { sym, sp, holding, gap: targetPerStock - (holding ? holding.shares * sp.price : 0) };
    }).filter((x): x is NonNullable<typeof x> => x !== null && x.gap > 0).sort((a, b) => b.gap - a.gap);
    for (const { sym, sp, holding, gap } of candidates) {
      const shares = Math.min(Math.floor(gap / sp.price) || 1, Math.floor(cash / sp.price));
      if (shares > 0 && cash >= shares * sp.price) {
        await executeBotTrade(db, participant.id, sym, sp.company_name ?? sym, "buy", shares, sp.price, cash, holding?.shares ?? 0);
        cash -= shares * sp.price;
        if (cash <= idleThreshold) break;
      }
    }
  }
}

async function runMomentumBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  let cash = participant.cash_balance;
  for (const holding of holdings) {
    const sp = priceMap[holding.symbol];
    if (sp && (sp.change_percent ?? 0) < -2 && holding.shares > 0) {
      await executeBotTrade(db, participant.id, holding.symbol, sp.company_name ?? holding.symbol, "sell", holding.shares, sp.price, cash, holding.shares);
      cash += holding.shares * sp.price;
    }
  }
  const gainers = [...prices].filter(p => (p.change_percent ?? 0) > 1 && p.price > 0)
    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0)).slice(0, 3);
  let bought = 0;
  for (const g of gainers) {
    if (bought >= 2) break;
    const cashPerBuy = cash * 0.35;
    if (cashPerBuy < g.price) continue;
    const shares = Math.floor(cashPerBuy / g.price);
    if (shares < 1) continue;
    const existing = holdings.find(h => h.symbol === g.symbol);
    await executeBotTrade(db, participant.id, g.symbol, g.company_name ?? g.symbol, "buy", shares, g.price, cash, existing?.shares ?? 0);
    cash -= shares * g.price;
    bought++;
  }
}

async function runChaosBot(db: DB, participant: Participant, holdings: Holding[], prices: StockPrice[]) {
  const roll = Math.random();
  if (roll < 0.35) return;
  const cash = participant.cash_balance;
  if (roll < 0.65 || holdings.length === 0) {
    const pool = prices.filter(p => p.price > 0 && p.price < cash * 0.4);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const shares = Math.max(1, Math.floor(cash * (0.05 + Math.random() * 0.15) / pick.price));
    if (cash >= shares * pick.price) {
      const existing = holdings.find(h => h.symbol === pick.symbol);
      await executeBotTrade(db, participant.id, pick.symbol, pick.company_name ?? pick.symbol, "buy", shares, pick.price, cash, existing?.shares ?? 0);
    }
  } else {
    const holding = holdings[Math.floor(Math.random() * holdings.length)];
    const sp = prices.find(p => p.symbol === holding.symbol);
    if (!sp || holding.shares < 1) return;
    const sharesToSell = Math.max(1, Math.floor(holding.shares * (0.25 + Math.random() * 0.5)));
    await executeBotTrade(db, participant.id, holding.symbol, sp.company_name ?? holding.symbol, "sell", sharesToSell, sp.price, cash, holding.shares);
  }
}

// ── Process limit orders ─────────────────────────────────────────────────────
async function processLimitOrders(db: DB, prices: StockPrice[]) {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  const { data: orders } = await db.from("limit_orders").select("*").eq("status", "pending");
  if (!orders?.length) return 0;
  let filled = 0;
  for (const order of orders) {
    const sp = priceMap[order.symbol];
    if (!sp) continue;
    const triggered = order.order_type === "buy" ? sp.price <= order.limit_price : sp.price >= order.limit_price;
    if (!triggered) continue;
    const { data: participant } = await db.from("competition_participants").select("cash_balance").eq("id", order.participant_id).single();
    if (!participant) continue;
    const { data: holding } = await db.from("holdings").select("shares, avg_cost").eq("participant_id", order.participant_id).eq("symbol", order.symbol).single();
    try {
      await executeBotTrade(db, order.participant_id, order.symbol, sp.company_name ?? order.symbol, order.order_type, order.shares, sp.price, participant.cash_balance, holding?.shares ?? 0);
      await db.from("limit_orders").update({ status: "filled", filled_at: new Date().toISOString(), fill_price: sp.price }).eq("id", order.id);
      filled++;
    } catch { /* skip */ }
  }
  return filled;
}

// ── Process player automation rules ─────────────────────────────────────────
interface PlayerRule {
  id: string;
  participant_id: string;
  competition_id: string;
  condition_type: string;
  symbol: string | null;
  condition_value: number;
  action: string;
  action_symbol: string | null;
  shares: number | null;
  repeat: boolean;
}

async function processPlayerRules(db: DB, compId: string, prices: StockPrice[]): Promise<number> {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));

  const { data: rules } = await db
    .from("player_rules")
    .select("*")
    .eq("competition_id", compId)
    .eq("status", "active");

  if (!rules?.length) return 0;
  let fired = 0;

  for (const rule of rules as PlayerRule[]) {
    try {
      // Fetch participant state
      const { data: participant } = await db
        .from("competition_participants")
        .select("id, cash_balance")
        .eq("id", rule.participant_id)
        .single();
      if (!participant) continue;

      // Evaluate condition
      let conditionMet = false;

      if (rule.condition_type === "price_below" || rule.condition_type === "price_above") {
        const sp = rule.symbol ? priceMap[rule.symbol] : null;
        if (!sp) continue;
        conditionMet = rule.condition_type === "price_below"
          ? sp.price <= rule.condition_value
          : sp.price >= rule.condition_value;

      } else if (rule.condition_type === "day_change_pct_below" || rule.condition_type === "day_change_pct_above") {
        const sp = rule.symbol ? priceMap[rule.symbol] : null;
        if (!sp) continue;
        const pct = sp.change_percent ?? 0;
        conditionMet = rule.condition_type === "day_change_pct_below"
          ? pct <= rule.condition_value
          : pct >= rule.condition_value;

      } else if (rule.condition_type === "portfolio_value_below" || rule.condition_type === "portfolio_value_above") {
        const { data: holdings } = await db
          .from("holdings")
          .select("symbol, shares")
          .eq("participant_id", rule.participant_id);
        const holdingsValue = (holdings ?? []).reduce((s, h) => {
          const sp = priceMap[h.symbol];
          return s + h.shares * (sp?.price ?? 0);
        }, 0);
        const totalValue = participant.cash_balance + holdingsValue;
        conditionMet = rule.condition_type === "portfolio_value_below"
          ? totalValue <= rule.condition_value
          : totalValue >= rule.condition_value;
      }

      if (!conditionMet) continue;

      // Execute action
      const sym = rule.action_symbol;
      if (!sym) continue;
      const sp = priceMap[sym];
      if (!sp || sp.price <= 0) continue;

      const { data: holding } = await db
        .from("holdings")
        .select("shares, avg_cost")
        .eq("participant_id", rule.participant_id)
        .eq("symbol", sym)
        .single();

      const currentShares = holding?.shares ?? 0;

      if (rule.action === "buy_shares" && rule.shares && rule.shares > 0) {
        await executeBotTrade(db, rule.participant_id, sym, sp.company_name ?? sym, "buy", rule.shares, sp.price, participant.cash_balance, currentShares);
      } else if (rule.action === "sell_shares" && rule.shares && rule.shares > 0 && currentShares >= rule.shares) {
        await executeBotTrade(db, rule.participant_id, sym, sp.company_name ?? sym, "sell", rule.shares, sp.price, participant.cash_balance, currentShares);
      } else if (rule.action === "sell_all" && currentShares > 0) {
        await executeBotTrade(db, rule.participant_id, sym, sp.company_name ?? sym, "sell", currentShares, sp.price, participant.cash_balance, currentShares);
      } else {
        continue;
      }

      // Update rule status
      await db.from("player_rules").update({
        triggered_at: new Date().toISOString(),
        trigger_count: (rule as any).trigger_count + 1,
        status: rule.repeat ? "active" : "triggered",
      }).eq("id", rule.id);

      fired++;
    } catch (err) {
      console.error(`Player rule ${rule.id} error:`, err);
    }
  }

  return fired;
}

// ── Margin interest + margin calls ──────────────────────────────────────────
const MARGIN_INTEREST_PER_TICK = 0.0005; // 0.05% per tick on borrowed amount
const MARGIN_CALL_THRESHOLD    = 1.20;   // liquidate if total_value < borrowed * 1.20

async function processMargin(db: DB, compId: string, prices: StockPrice[]): Promise<{ interest: number; calls: number }> {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));

  const { data: participants } = await db
    .from("competition_participants")
    .select("id, cash_balance, margin_limit")
    .eq("competition_id", compId)
    .eq("is_bot", false);

  if (!participants?.length) return { interest: 0, calls: 0 };

  let interestCharged = 0;
  let marginCalls = 0;

  for (const p of participants) {
    const borrowed = p.cash_balance < 0 ? Math.abs(p.cash_balance) : 0;
    if (borrowed <= 0) continue;

    // Fetch holdings to compute portfolio value
    const { data: holdings } = await db
      .from("holdings")
      .select("symbol, shares")
      .eq("participant_id", p.id);

    const holdingsValue = (holdings ?? []).reduce((sum, h) => {
      const sp = priceMap[h.symbol];
      return sum + h.shares * (sp?.price ?? 0);
    }, 0);

    const totalValue = p.cash_balance + holdingsValue; // cash is negative

    // ── Margin call check ──────────────────────────────────────────────────
    if (totalValue < borrowed * MARGIN_CALL_THRESHOLD) {
      // Force-sell largest holding to cover margin
      const sortedHoldings = (holdings ?? [])
        .map(h => ({ ...h, value: h.shares * (priceMap[h.symbol]?.price ?? 0) }))
        .sort((a, b) => b.value - a.value);

      for (const h of sortedHoldings) {
        const sp = priceMap[h.symbol];
        if (!sp || h.shares < 1) continue;
        const sellValue = h.shares * sp.price;
        // Sell entire position
        await db.from("competition_participants")
          .update({ cash_balance: p.cash_balance + sellValue })
          .eq("id", p.id);
        await db.from("holdings").delete()
          .eq("participant_id", p.id).eq("symbol", h.symbol);
        await db.from("trades").insert({
          participant_id: p.id, symbol: h.symbol,
          company_name: sp.company_name ?? h.symbol,
          action: "sell", shares: h.shares, price: sp.price, total: sellValue,
        });
        marginCalls++;
        break; // One liquidation per tick — re-evaluate next tick
      }
      continue;
    }

    // ── Charge interest ────────────────────────────────────────────────────
    const interest = borrowed * MARGIN_INTEREST_PER_TICK;
    await db.from("competition_participants")
      .update({ cash_balance: p.cash_balance - interest })
      .eq("id", p.id);
    interestCharged++;
  }

  return { interest: interestCharged, calls: marginCalls };
}

// ── Advance bracket rounds ───────────────────────────────────────────────────
async function processBrackets(db: DB): Promise<number> {
  // Find active bracket rounds that have passed their end_at
  const { data: dueRounds } = await db
    .from("bracket_rounds")
    .select("id, competition_id")
    .eq("status", "active")
    .lte("end_at", new Date().toISOString());

  if (!dueRounds?.length) return 0;
  let advanced = 0;

  for (const round of dueRounds) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/bracket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", competitionId: round.competition_id, roundId: round.id }),
      });
      if (res.ok) advanced++;
    } catch { /* continue */ }
  }
  return advanced;
}

// ── Resolve prediction bets ──────────────────────────────────────────────────
const BET_WIN_MULTIPLIER  = 1.85;
const BET_PUSH_THRESHOLD  = 0.001; // <0.1% move = push

async function processPredictionBets(db: DB, prices: StockPrice[]): Promise<{ wins: number; losses: number; pushes: number }> {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));

  const { data: dueBets } = await db
    .from("prediction_bets")
    .select("*")
    .eq("resolved", false)
    .lte("resolve_at", new Date().toISOString());

  if (!dueBets?.length) return { wins: 0, losses: 0, pushes: 0 };

  let wins = 0, losses = 0, pushes = 0;

  for (const bet of dueBets) {
    const sp = priceMap[bet.symbol];
    const exitPrice = sp?.price ?? bet.entry_price;
    const changePct = (exitPrice - bet.entry_price) / bet.entry_price;

    let outcome: "win" | "loss" | "push";
    let payout = 0;

    if (Math.abs(changePct) < BET_PUSH_THRESHOLD) {
      outcome = "push";
      payout  = bet.stake;
      pushes++;
    } else if (
      (bet.direction === "up"   && changePct > 0) ||
      (bet.direction === "down" && changePct < 0)
    ) {
      outcome = "win";
      payout  = Math.round(bet.stake * BET_WIN_MULTIPLIER * 100) / 100;
      wins++;
    } else {
      outcome = "loss";
      payout  = 0;
      losses++;
    }

    // Mark resolved
    await db.from("prediction_bets").update({
      resolved: true, outcome, exit_price: exitPrice, payout,
    }).eq("id", bet.id);

    // Credit payout to participant
    if (payout > 0) {
      const { data: p } = await db
        .from("competition_participants")
        .select("cash_balance")
        .eq("id", bet.participant_id)
        .single();
      if (p) {
        await db.from("competition_participants")
          .update({ cash_balance: p.cash_balance + payout })
          .eq("id", bet.participant_id);
      }
    }
  }

  return { wins, losses, pushes };
}

// ── Day trading EOD force-close (3:58pm ET) ─────────────────────────────────
function isEODWindow(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;
  // Window: 3:58pm – 4:00pm ET
  return mins >= 15 * 60 + 58 && mins < 16 * 60;
}

async function processEODClose(db: DB, prices: StockPrice[]): Promise<number> {
  if (!isEODWindow()) return 0;

  // Only day_trade competitions
  const { data: dayComps } = await db
    .from("competitions")
    .select("id")
    .eq("status", "active")
    .eq("style", "day_trade");

  if (!dayComps?.length) return 0;

  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  let closed = 0;

  for (const comp of dayComps) {
    const { data: participants } = await db
      .from("competition_participants")
      .select("id, cash_balance")
      .eq("competition_id", comp.id);

    for (const p of (participants ?? [])) {
      const { data: holdings } = await db
        .from("holdings")
        .select("symbol, shares")
        .eq("participant_id", p.id);

      for (const h of (holdings ?? [])) {
        const sp = priceMap[h.symbol];
        if (!sp || h.shares < 1) continue;
        const proceeds = h.shares * sp.price;
        await db.from("competition_participants")
          .update({ cash_balance: p.cash_balance + proceeds })
          .eq("id", p.id);
        await db.from("holdings").delete()
          .eq("participant_id", p.id).eq("symbol", h.symbol);
        await db.from("trades").insert({
          participant_id: p.id, symbol: h.symbol,
          company_name: sp.company_name ?? h.symbol,
          action: "sell", shares: h.shares, price: sp.price, total: proceeds,
        });
        closed++;
      }
    }
  }

  return closed;
}

// ── Process IPO events ───────────────────────────────────────────────────────
const HYPE_VOLATILITY: Record<string, number> = { low: 1.02, medium: 1.08, high: 1.18 };

async function processIPOs(db: DB): Promise<string[]> {
  const { data: dueIPOs } = await db
    .from("ipo_events")
    .select("*")
    .eq("listed", false)
    .lte("list_at", new Date().toISOString());

  if (!dueIPOs?.length) return [];
  const listed: string[] = [];

  for (const ipo of dueIPOs) {
    // Apply a hype-driven opening pop (random within hype band)
    const maxMultiplier = HYPE_VOLATILITY[ipo.hype_level] ?? 1.08;
    const openingPop = 1 + (Math.random() * (maxMultiplier - 1));
    const openingPrice = Math.round(ipo.ipo_price * openingPop * 100) / 100;
    const changePct = ((openingPrice - ipo.ipo_price) / ipo.ipo_price) * 100;

    // Insert/update stock_prices so it becomes tradeable
    await db.from("stock_prices").upsert({
      symbol:         ipo.symbol,
      company_name:   ipo.company_name,
      price:          openingPrice,
      open:           ipo.ipo_price,
      prev_close:     ipo.ipo_price,
      change_amount:  openingPrice - ipo.ipo_price,
      change_percent: changePct,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "symbol" });

    // Mark as listed
    await db.from("ipo_events").update({ listed: true }).eq("id", ipo.id);

    listed.push(ipo.symbol);
  }

  return listed;
}

// ── End expired competitions ─────────────────────────────────────────────────
async function endExpiredCompetitions(db: DB): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const { data: expired } = await db
    .from("competitions")
    .select("id, name")
    .eq("status", "active")
    .lt("end_date", today);
  if (!expired?.length) return 0;
  for (const comp of expired) {
    await db.from("competitions").update({ status: "ended" }).eq("id", comp.id);
  }
  return expired.length;
}

// ── Main tick handler ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth check
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-tick-secret") ?? "";
  if (TICK_SECRET && secret !== TICK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marketOpen = isMarketOpen();
  const db = getAdminClient();

  // End expired competitions regardless of market hours
  const ended = await endExpiredCompetitions(db);

  if (!marketOpen) {
    return NextResponse.json({ message: "Market closed", ended });
  }

  // Refresh prices
  const pricesRefreshed = await refreshPrices(db);

  // Get active competitions
  const { data: competitions } = await db.from("competitions").select("id").eq("status", "active");
  if (!competitions?.length) {
    return NextResponse.json({ message: "No active competitions", pricesRefreshed, ended });
  }

  // Get current prices
  const { data: priceRows } = await db.from("stock_prices").select("symbol, company_name, price, change_percent");
  const stockPrices: StockPrice[] = priceRows ?? [];

  // Process IPOs (global — not per competition)
  const iposListed = await processIPOs(db);

  // Advance bracket rounds
  const bracketsAdvanced = await processBrackets(db);

  // Resolve prediction bets
  const { wins: betWins, losses: betLosses, pushes: betPushes } = await processPredictionBets(db, stockPrices);

  // Day trade EOD force-close
  const eodClosed = await processEODClose(db, stockPrices);

  let tradesExecuted = 0;
  let ordersFilledTotal = 0;
  let playerRulesFired = 0;
  let marginInterestCharged = 0;
  let marginCallsFired = 0;

  for (const comp of competitions) {
    // Process limit orders
    const ordersFilled = await processLimitOrders(db, stockPrices);
    ordersFilledTotal += ordersFilled;

    // Process player automation rules
    const rulesFired = await processPlayerRules(db, comp.id, stockPrices);
    playerRulesFired += rulesFired;

    // Process margin interest + margin calls
    const { interest, calls } = await processMargin(db, comp.id, stockPrices);
    marginInterestCharged += interest;
    marginCallsFired += calls;

    // Run bots
    const { data: bots } = await db
      .from("competition_participants")
      .select("id, competition_id, cash_balance, bot_strategy")
      .eq("competition_id", comp.id)
      .eq("is_bot", true);

    for (const bot of (bots ?? []) as Participant[]) {
      // Cooldown check
      const { data: lastTrade } = await db.from("trades").select("executed_at")
        .eq("participant_id", bot.id).order("executed_at", { ascending: false }).limit(1).single();
      if (lastTrade?.executed_at) {
        const minsAgo = (Date.now() - new Date(lastTrade.executed_at).getTime()) / 60000;
        if (minsAgo < BOT_COOLDOWN_MINUTES) continue;
      }

      const { data: holdings } = await db.from("holdings").select("id, participant_id, symbol, shares, avg_cost").eq("participant_id", bot.id);
      try {
        switch (bot.bot_strategy) {
          case "index":    await runIndexBot(db, bot, holdings ?? [], stockPrices); break;
          case "momentum": await runMomentumBot(db, bot, holdings ?? [], stockPrices); break;
          case "random":   await runChaosBot(db, bot, holdings ?? [], stockPrices); break;
        }
        tradesExecuted++;
      } catch (err) { console.error(`Bot ${bot.id} error:`, err); }
    }
  }

  return NextResponse.json({ success: true, pricesRefreshed, tradesExecuted, ordersFilledTotal, playerRulesFired, marginInterestCharged, marginCallsFired, iposListed, eodClosed, betWins, betLosses, betPushes, bracketsAdvanced, ended, competitions: competitions.length });
}
