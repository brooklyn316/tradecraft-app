import { supabase } from "./supabase";
import type { CandleInterval } from "@/types";

const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stock-prices`;

export async function fetchStockPrices(symbols: string[], interval: CandleInterval = "5min", fetchCandles = false) {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, interval, fetchCandles }),
    });
    if (!res.ok) throw new Error(`Edge function error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchStockPrices error:", err);
    return null;
  }
}

export async function getStockPrices(symbols?: string[]) {
  let query = supabase.from("stock_prices").select("*");
  if (symbols && symbols.length > 0) {
    query = query.in("symbol", symbols);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCandles(symbol: string, interval: CandleInterval, limit = 150) {
  const { data, error } = await supabase
    .from("stock_candles")
    .select("*")
    .eq("symbol", symbol)
    .eq("interval", interval)
    .order("time", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUserCompetitions(userId: string) {
  const { data, error } = await supabase
    .from("competition_participants")
    .select(`
      *,
      competition:competitions(*)
    `)
    .eq("user_id", userId)
    .eq("is_bot", false);
  if (error) throw error;
  return data ?? [];
}

export async function getParticipant(competitionId: string, userId: string) {
  const { data, error } = await supabase
    .from("competition_participants")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getHoldings(participantId: string) {
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("participant_id", participantId);
  if (error) throw error;
  return data ?? [];
}

export async function getRecentTrades(participantId: string, limit = 20) {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("participant_id", participantId)
    .order("executed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function executeTrade({
  participantId,
  symbol,
  companyName,
  action,
  shares,
  price,
  currentCashBalance,
  currentShares,
}: {
  participantId: string;
  symbol: string;
  companyName: string;
  action: "buy" | "sell";
  shares: number;
  price: number;
  currentCashBalance: number;
  currentShares: number;
}) {
  const total = shares * price;

  if (action === "buy") {
    if (currentCashBalance < total) throw new Error("Insufficient funds");
    const newCash = currentCashBalance - total;
    const newShares = currentShares + shares;
    const avgCost =
      currentShares === 0
        ? price
        : (currentShares * price + total) / newShares;

    const { error: cashError } = await supabase
      .from("competition_participants")
      .update({ cash_balance: newCash })
      .eq("id", participantId);
    if (cashError) throw cashError;

    const { error: holdingError } = await supabase.from("holdings").upsert(
      {
        participant_id: participantId,
        symbol,
        shares: newShares,
        avg_cost: avgCost,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "participant_id,symbol" }
    );
    if (holdingError) throw holdingError;
  } else {
    if (currentShares < shares) throw new Error("Insufficient shares");
    const newCash = currentCashBalance + total;
    const newShares = currentShares - shares;

    const { error: cashError } = await supabase
      .from("competition_participants")
      .update({ cash_balance: newCash })
      .eq("id", participantId);
    if (cashError) throw cashError;

    if (newShares === 0) {
      const { error } = await supabase
        .from("holdings")
        .delete()
        .eq("participant_id", participantId)
        .eq("symbol", symbol);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("holdings")
        .update({ shares: newShares, updated_at: new Date().toISOString() })
        .eq("participant_id", participantId)
        .eq("symbol", symbol);
      if (error) throw error;
    }
  }

  const { error: tradeError } = await supabase.from("trades").insert({
    participant_id: participantId,
    symbol,
    company_name: companyName,
    action,
    shares,
    price,
    total,
  });
  if (tradeError) throw tradeError;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function getPortfolioValue(participantId: string): Promise<number> {
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("symbol, shares")
    .eq("participant_id", participantId);
  if (error) throw error;
  if (!holdings || holdings.length === 0) return 0;

  const symbols = holdings.map((h) => h.symbol);
  const { data: prices, error: priceError } = await supabase
    .from("stock_prices")
    .select("symbol, price")
    .in("symbol", symbols);
  if (priceError) throw priceError;

  const priceMap = new Map((prices ?? []).map((p) => [p.symbol, p.price]));
  return holdings.reduce((total, h) => {
    const price = priceMap.get(h.symbol) ?? 0;
    return total + h.shares * price;
  }, 0);
}

export async function getAllStockPrices() {
  const { data, error } = await supabase
    .from("stock_prices")
    .select("*")
    .order("symbol");
  if (error) throw error;
  return data ?? [];
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export async function getWatchlist(userId: string) {
  const { data, error } = await supabase
    .from("watchlist")
    .select("symbol, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addToWatchlist(userId: string, symbol: string) {
  const { error } = await supabase
    .from("watchlist")
    .insert({ user_id: userId, symbol });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function removeFromWatchlist(userId: string, symbol: string) {
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);
  if (error) throw error;
}

// ── Price Alerts ──────────────────────────────────────────

export interface PriceAlert {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  condition: "above" | "below";
  target_price: number;
  triggered: boolean;
  created_at: string;
  triggered_at: string | null;
}

export async function getPriceAlerts(userId: string): Promise<PriceAlert[]> {
  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("user_id", userId)
    .eq("triggered", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PriceAlert[];
}

export async function addPriceAlert(
  userId: string,
  symbol: string,
  companyName: string | null,
  condition: "above" | "below",
  targetPrice: number
): Promise<void> {
  const { error } = await supabase.from("price_alerts").insert({
    user_id: userId,
    symbol,
    company_name: companyName,
    condition,
    target_price: targetPrice,
  });
  if (error) throw error;
}

export async function removePriceAlert(alertId: string): Promise<void> {
  const { error } = await supabase.from("price_alerts").delete().eq("id", alertId);
  if (error) throw error;
}

export async function markAlertTriggered(alertId: string): Promise<void> {
  const { error } = await supabase
    .from("price_alerts")
    .update({ triggered: true, triggered_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) throw error;
}
