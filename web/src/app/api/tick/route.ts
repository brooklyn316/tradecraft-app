import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getTodaysChallenge } from "@/lib/daily-challenge";
import { updateStreak, checkAndAwardBadges } from "@/lib/badges";
import { awardMW, badgeMWReward, MW_REWARDS } from "@/lib/market-wealth";
import { CRYPTO_SYMBOLS } from "@/lib/crypto-prices";
import { NZX_SYMBOLS } from "@/lib/nzx-stocks";
import { LSE_SYMBOLS } from "@/lib/lse-stocks";
import { TSE_SYMBOLS } from "@/lib/tse-stocks";
import { ASX_SYMBOLS } from "@/lib/asx-stocks";
import { isNZXOpen } from "@/lib/market-hours";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const TICK_SECRET = process.env.TICK_SECRET ?? "";
const BOT_COOLDOWN_MINUTES = 15;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Market hours checks ──────────────────────────────────────────────────────
function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

// ── Refresh stock prices via Edge Function ───────────────────────────────────
const US_SYMBOLS = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","AMD","NFLX","JPM",
  "V","MA","JNJ","PFE","XOM","CVX","WMT","KO","PYPL","COIN",
  "SPY","QQQ","RIVN","SNAP","UBER","DIS","BABA","SHOP","SQ","PLTR",
  "BAC","GS","INTC","MU","ORCL","ADBE","CRM","HOOD","RBLX","SOFI",
  "NKE","SBUX","MCD","F","GM","BA","CAT","GE","MMM","T",
];

async function refreshPrices(symbols: string[]): Promise<boolean> {
  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stock-prices`;
  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    return res.ok;
  } catch {
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

// ── Process daily challenges ─────────────────────────────────────────────────
async function processDailyChallenges(db: DB, prices: StockPrice[]): Promise<number> {
  const challenge = await getTodaysChallenge(db);
  if (!challenge) return 0;

  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00Z`;
  const priceMap     = Object.fromEntries(prices.map(p => [p.symbol, p]));
  const priceNumMap  = Object.fromEntries(prices.map(p => [p.symbol, p.price]));

  // Get all human participants in active competitions not yet completed today's challenge
  const { data: allParticipants } = await db
    .from("competition_participants")
    .select("id, user_id, cash_balance, competition_id")
    .eq("is_bot", false)
    .not("user_id", "is", null);

  if (!allParticipants?.length) return 0;

  // Which participants already completed this challenge?
  const { data: completions } = await db
    .from("daily_challenge_completions")
    .select("participant_id")
    .eq("challenge_id", challenge.id);
  const alreadyDone = new Set((completions ?? []).map(c => c.participant_id));

  let rewarded = 0;

  for (const p of allParticipants) {
    if (alreadyDone.has(p.id)) continue;

    let progress = 0;

    switch (challenge.challenge_type) {
      case "trade_count": {
        const { count } = await db.from("trades")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", p.id)
          .gte("executed_at", todayStart);
        progress = count ?? 0;
        break;
      }
      case "big_single_trade": {
        const { data } = await db.from("trades")
          .select("total")
          .eq("participant_id", p.id)
          .eq("action", "buy")
          .gte("executed_at", todayStart)
          .order("total", { ascending: false })
          .limit(1);
        progress = data?.[0]?.total ?? 0;
        break;
      }
      case "diversify": {
        const { count } = await db.from("holdings")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", p.id);
        progress = count ?? 0;
        break;
      }
      case "portfolio_gain": {
        const { data: comp } = await db.from("competitions")
          .select("starting_cash").eq("id", p.competition_id).single();
        const startingCash = comp?.starting_cash ?? 10000;
        const { data: holdings } = await db.from("holdings")
          .select("symbol, shares").eq("participant_id", p.id);
        const holdVal = (holdings ?? []).reduce((s, h) => {
          const sp = priceMap[h.symbol];
          return s + h.shares * (sp?.price ?? 0);
        }, 0);
        progress = ((p.cash_balance + holdVal - startingCash) / startingCash) * 100;
        break;
      }
      case "buy_volume": {
        const { data } = await db.from("trades")
          .select("total")
          .eq("participant_id", p.id)
          .eq("action", "buy")
          .gte("executed_at", todayStart);
        progress = (data ?? []).reduce((s: number, t: { total: number }) => s + t.total, 0);
        break;
      }
      case "short_sell": {
        const { count } = await db.from("short_positions")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", p.id)
          .gte("created_at", todayStart);
        progress = count ?? 0;
        break;
      }
      case "options_trade": {
        const { count } = await db.from("option_positions")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", p.id)
          .gte("purchased_at", todayStart);
        progress = count ?? 0;
        break;
      }
    }

    if (progress >= challenge.target_value) {
      // Credit reward
      await db.from("competition_participants")
        .update({ cash_balance: p.cash_balance + challenge.reward_cash })
        .eq("id", p.id);

      await db.from("daily_challenge_completions").insert({
        challenge_id:   challenge.id,
        user_id:        p.user_id,
        participant_id: p.id,
        reward_granted: challenge.reward_cash,
      });

      // Update streak + award MW for daily challenge
      if (p.user_id) {
        await updateStreak(db, p.user_id);
        await awardMW(db, p.user_id, MW_REWARDS.daily_challenge, "daily_challenge", challenge.id);
      }

      rewarded++;
    }

    // Check and award badges every tick (idempotent)
    if (p.user_id) {
      const { data: compRow } = await db
        .from("competitions").select("starting_cash").eq("id", p.competition_id).single();
      await checkAndAwardBadges(db, p.user_id, p.id, compRow?.starting_cash ?? 10000, priceNumMap);
    }
  }

  return rewarded;
}

// ── Settle expired options ───────────────────────────────────────────────────
async function processOptionsExpiry(db: DB, prices: StockPrice[]): Promise<{ settled: number; totalPayout: number }> {
  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: duePositions } = await db
    .from("option_positions")
    .select("*")
    .eq("settled", false)
    .lte("expiry", today);

  if (!duePositions?.length) return { settled: 0, totalPayout: 0 };

  let settled = 0;
  let totalPayout = 0;

  for (const pos of duePositions) {
    const sp = priceMap[pos.symbol];
    const exitPrice = sp?.price ?? 0;

    // Intrinsic value at expiry
    const intrinsic = pos.option_type === "call"
      ? Math.max(0, exitPrice - pos.strike)
      : Math.max(0, pos.strike - exitPrice);

    const payout    = Math.round(intrinsic * 100 /* CONTRACT_SIZE */ * pos.contracts * 100) / 100;
    const costBasis = Math.round(pos.premium_paid * 100 * pos.contracts * 100) / 100;
    const pnl       = Math.round((payout - costBasis) * 100) / 100;

    // Mark settled
    await db.from("option_positions").update({ settled: true, payout, pnl }).eq("id", pos.id);

    // Credit payout if in-the-money
    if (payout > 0) {
      const { data: p } = await db
        .from("competition_participants")
        .select("cash_balance")
        .eq("id", pos.participant_id)
        .single();
      if (p) {
        await db.from("competition_participants")
          .update({ cash_balance: p.cash_balance + payout })
          .eq("id", pos.participant_id);
        totalPayout += payout;
      }
    }

    settled++;
  }

  return { settled, totalPayout };
}

// ── End expired competitions + award MW ─────────────────────────────────────
async function endExpiredCompetitions(db: DB, prices: StockPrice[]): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const { data: expired } = await db
    .from("competitions")
    .select("id, name, starting_cash")
    .eq("status", "active")
    .lt("end_date", today);
  if (!expired?.length) return 0;

  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p.price]));

  for (const comp of expired) {
    await db.from("competitions").update({ status: "ended" }).eq("id", comp.id);

    // Compute final rankings
    const { data: participants } = await db
      .from("competition_participants")
      .select("id, user_id, cash_balance, is_bot")
      .eq("competition_id", comp.id)
      .eq("is_bot", false)
      .not("user_id", "is", null);

    if (!participants?.length) continue;

    // Fetch holdings for portfolio value
    const { data: allHoldings } = await db
      .from("holdings")
      .select("participant_id, symbol, shares")
      .in("participant_id", participants.map(p => p.id));

    const holdMap: Record<string, number> = {};
    for (const h of (allHoldings ?? []) as { participant_id: string; symbol: string; shares: number }[]) {
      holdMap[h.participant_id] = (holdMap[h.participant_id] ?? 0) + h.shares * (priceMap[h.symbol] ?? 0);
    }

    const ranked = [...participants]
      .map(p => ({ ...p, total: p.cash_balance + (holdMap[p.id] ?? 0) }))
      .sort((a, b) => b.total - a.total);

    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      if (!p.user_id) continue;

      // Participation reward
      await awardMW(db, p.user_id, MW_REWARDS.competition_participation, "competition_participation", comp.id);

      // Rank bonus
      if (i === 0) await awardMW(db, p.user_id, MW_REWARDS.competition_1st, "competition_1st", comp.id);
      else if (i === 1) await awardMW(db, p.user_id, MW_REWARDS.competition_2nd, "competition_2nd", comp.id);
      else if (i === 2) await awardMW(db, p.user_id, MW_REWARDS.competition_3rd, "competition_3rd", comp.id);
    }
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

  // Refresh prices — US stocks during NYSE hours, NZX always (Yahoo returns last-known when closed), crypto always
  const nzxOpen = isNZXOpen();
  // All non-US exchanges fetch unconditionally — Yahoo returns last-known price when closed.
  // Crypto and international exchanges use the same edge-function path (Vercel IPs get
  // blocked by Yahoo directly; the Supabase edge function on Deno/CF works fine).
  const [pricesRefreshed, lseRefreshed, tseRefreshed, asxRefreshed, nzxRefreshed, cryptoRefreshed] = await Promise.all([
    marketOpen ? refreshPrices(US_SYMBOLS) : Promise.resolve(false),
    refreshPrices(LSE_SYMBOLS as unknown as string[]),
    refreshPrices(TSE_SYMBOLS as unknown as string[]),
    refreshPrices(ASX_SYMBOLS as unknown as string[]),
    refreshPrices(NZX_SYMBOLS),
    refreshPrices(CRYPTO_SYMBOLS as unknown as string[]),
  ]);

  // Get current prices
  const { data: priceRows } = await db.from("stock_prices").select("symbol, company_name, price, change_percent");
  const stockPrices: StockPrice[] = priceRows ?? [];

  // End expired competitions (awards MW, so needs prices)
  const ended = await endExpiredCompetitions(db, stockPrices);

  // Get active competitions — always process crypto ones even when market is closed
  const { data: competitions } = await db
    .from("competitions")
    .select("id, style")
    .eq("status", "active");

  const cryptoCompIds = new Set(
    (competitions ?? []).filter((c: { id: string; style: string }) => c.style === "crypto").map((c: { id: string }) => c.id)
  );
  const hasCryptoComps = cryptoCompIds.size > 0;

  if (!marketOpen && !hasCryptoComps) {
    return NextResponse.json({ message: "Market closed", ended, cryptoRefreshed, nzxRefreshed });
  }

  if (!competitions?.length) {
    return NextResponse.json({ message: "No active competitions", pricesRefreshed, cryptoRefreshed, ended });
  }
  const cryptoPrices = stockPrices.filter(p => CRYPTO_SYMBOLS.includes(p.symbol as typeof CRYPTO_SYMBOLS[number]));

  // When market is closed, only process crypto competitions
  const activeComps = marketOpen
    ? (competitions ?? [])
    : (competitions ?? []).filter((c: { id: string; style: string }) => c.style === "crypto");

  if (!activeComps.length) {
    return NextResponse.json({ message: "No eligible competitions to process", pricesRefreshed, cryptoRefreshed, ended });
  }

  // Process IPOs (global — not per competition, only during market hours)
  const iposListed = marketOpen ? await processIPOs(db) : 0;

  // Settle expired options
  const { settled: optionsSettled, totalPayout: optionsPayout } = await processOptionsExpiry(db, stockPrices);

  // Process daily challenges
  const challengesRewarded = await processDailyChallenges(db, stockPrices);

  // Advance bracket rounds (only during market hours)
  const bracketsAdvanced = marketOpen ? await processBrackets(db) : 0;

  // Resolve prediction bets (only during market hours)
  const { wins: betWins, losses: betLosses, pushes: betPushes } = marketOpen
    ? await processPredictionBets(db, stockPrices)
    : { wins: 0, losses: 0, pushes: 0 };

  // Day trade EOD force-close (only during market hours)
  const eodClosed = marketOpen ? await processEODClose(db, stockPrices) : 0;

  let tradesExecuted = 0;
  let ordersFilledTotal = 0;
  let playerRulesFired = 0;
  let marginInterestCharged = 0;
  let marginCallsFired = 0;

  for (const comp of activeComps) {
    const isCrypto = cryptoCompIds.has(comp.id);
    // Use crypto-only prices for crypto competitions, full list otherwise
    const compPrices = isCrypto ? cryptoPrices : stockPrices;

    // Process limit orders
    const ordersFilled = await processLimitOrders(db, compPrices);
    ordersFilledTotal += ordersFilled;

    // Process player automation rules
    const rulesFired = await processPlayerRules(db, comp.id, compPrices);
    playerRulesFired += rulesFired;

    // Process margin interest + margin calls
    const { interest, calls } = await processMargin(db, comp.id, compPrices);
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
          case "index":    await runIndexBot(db, bot, holdings ?? [], compPrices); break;
          case "momentum": await runMomentumBot(db, bot, holdings ?? [], compPrices); break;
          case "random":   await runChaosBot(db, bot, holdings ?? [], compPrices); break;
        }
        tradesExecuted++;
      } catch (err) { console.error(`Bot ${bot.id} error:`, err); }
    }
  }

  return NextResponse.json({ success: true, pricesRefreshed, nzxRefreshed, cryptoRefreshed, tradesExecuted, ordersFilledTotal, playerRulesFired, marginInterestCharged, marginCallsFired, iposListed, eodClosed, betWins, betLosses, betPushes, bracketsAdvanced, optionsSettled, optionsPayout, challengesRewarded, ended, competitions: activeComps.length });
}
