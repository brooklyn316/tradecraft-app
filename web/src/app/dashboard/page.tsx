"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getAllStockPrices, getUserCompetitions, getHoldings,
  getRecentTrades, getWatchlist, addToWatchlist, removeFromWatchlist,
  getWatchlist as fetchWatchlist,
} from "@/lib/stockApi";
import type {
  StockPrice, CompetitionParticipant, Competition,
  Holding, Trade, WatchlistItem, LeaderboardEntry,
} from "@/types";

import TickerBar        from "@/components/TickerBar";
import Portfolio        from "@/components/Portfolio";
import StockList        from "@/components/StockList";
import TradePanel       from "@/components/TradePanel";
import TradingChart     from "@/components/TradingChart";
import TradeHistory     from "@/components/TradeHistory";
import Leaderboard      from "@/components/Leaderboard";
import NewsPanel        from "@/components/NewsPanel";
import AIAdvisor        from "@/components/AIAdvisor";
import Watchlist        from "@/components/Watchlist";
import LimitOrders      from "@/components/LimitOrders";
import PriceAlerts      from "@/components/PriceAlerts";
import CompetitionSetup from "@/components/CompetitionSetup";
import Toast            from "@/components/Toast";

type CenterTab = "chart" | "history" | "leaderboard" | "news" | "ai" | "watchlist" | "limits" | "alerts";

export default function DashboardPage() {
  const supabase = getSupabaseClient();

  // ── Auth ──────────────────────────────────────────────────
  const [userId, setUserId]     = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = "/"; return; }
      setUserId(data.user.id);
      setAuthReady(true);
    });
  }, []);

  // ── Data ──────────────────────────────────────────────────
  const [competitions, setCompetitions] = useState<(CompetitionParticipant & { competition: Competition })[]>([]);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [stocks, setStocks]             = useState<StockPrice[]>([]);
  const [holdings, setHoldings]         = useState<Holding[]>([]);
  const [trades, setTrades]             = useState<Trade[]>([]);
  const [watchlist, setWatchlist]       = useState<WatchlistItem[]>([]);
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── UI state ──────────────────────────────────────────────
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [centerTab, setCenterTab]         = useState<CenterTab>("chart");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const participant   = competitions[activeIdx] ?? null;
  const competition   = participant?.competition ?? null;
  const participantId = participant?.id ?? null;

  // ── Leaderboard fetch ─────────────────────────────────────
  const loadLeaderboard = useCallback(async (compId: string, startingCash: number) => {
    const { data } = await supabase
      .from("competition_participants")
      .select("id, user_id, is_bot, bot_strategy, cash_balance, profiles(username)")
      .eq("competition_id", compId);
    if (!data) return;

    const priceMap = new Map(stocks.map(s => [s.symbol, s.price]));

    const entries = await Promise.all(data.map(async (p: any) => {
      const { data: h } = await supabase.from("holdings").select("symbol, shares").eq("participant_id", p.id);
      const portfolioValue = (h ?? []).reduce((sum: number, hld: any) => sum + hld.shares * (priceMap.get(hld.symbol) ?? 0), 0);
      const totalValue = p.cash_balance + portfolioValue;
      return {
        participant_id: p.id,
        user_id:        p.user_id,
        is_bot:         p.is_bot,
        username:       p.is_bot ? (p.bot_strategy ?? "Bot") : (p.profiles?.username ?? "Player"),
        cash_balance:   p.cash_balance,
        portfolio_value: portfolioValue,
        total_value:    totalValue,
        return_amount:  totalValue - startingCash,
        return_percent: ((totalValue - startingCash) / startingCash) * 100,
        rank:           0,
      } as LeaderboardEntry;
    }));

    entries.sort((a, b) => b.total_value - a.total_value);
    entries.forEach((e, i) => { e.rank = i + 1; });
    setLeaderboard(entries);
  }, [supabase, stocks]);

  // ── Main load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [comps, allStocks, wl] = await Promise.all([
        getUserCompetitions(userId),
        getAllStockPrices(),
        getWatchlist(userId),
      ]);
      setStocks(allStocks);
      setWatchlist(wl.map(w => ({ ...w, id: `${userId}-${w.symbol}`, user_id: userId! })));

      const active = (comps as any[]).filter(c => c.competition?.status === "active");
      setCompetitions(active as any);

      if (active.length > 0 && !selectedStock && allStocks.length > 0) {
        setSelectedStock(allStocks.find(s => s.symbol === "AAPL") ?? allStocks[0]);
      }

      if (active[activeIdx]) {
        const pid = active[activeIdx].id;
        const [h, t] = await Promise.all([getHoldings(pid), getRecentTrades(pid)]);
        setHoldings(h as Holding[]);
        setTrades(t as Trade[]);
        if (active[activeIdx].competition) {
          await loadLeaderboard(active[activeIdx].competition.id, active[activeIdx].competition.starting_cash);
        }
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, activeIdx, selectedStock, loadLeaderboard]);

  useEffect(() => {
    if (!authReady) return;
    loadAll();
    refreshRef.current = setInterval(loadAll, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [authReady, loadAll]);

  const handleTradeComplete = useCallback(() => {
    setToast({ message: "Trade executed successfully!", type: "success" });
    setTimeout(() => loadAll(), 500);
  }, [loadAll]);

  const handleToggleWatch = useCallback(async (symbol: string) => {
    if (!userId) return;
    const isWatched = watchlist.some(w => w.symbol === symbol);
    if (isWatched) {
      await removeFromWatchlist(userId, symbol);
    } else {
      await addToWatchlist(userId, symbol);
    }
    const wl = await fetchWatchlist(userId);
    setWatchlist(wl.map(w => ({ ...w, id: `${userId}-${w.symbol}`, user_id: userId! })));
  }, [userId, watchlist]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  // ── Loading / auth screens ─────────────────────────────────
  if (!authReady || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading Tradecraft…</p>
        </div>
      </div>
    );
  }

  // ── No active competition ─────────────────────────────────
  if (competitions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-bold text-lg">TC</span>
            <span className="font-semibold">Tradecraft</span>
          </div>
          <button onClick={handleSignOut} className="text-gray-400 hover:text-white text-sm">Sign out</button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full">
            <h1 className="text-2xl font-bold mb-2 text-center">Welcome to Tradecraft</h1>
            <p className="text-gray-400 text-center mb-8">Start a competition to begin trading</p>
            <CompetitionSetup userId={userId!} onCreated={loadAll} />
          </div>
        </div>
      </div>
    );
  }

  const selectedHolding = selectedStock
    ? holdings.find(h => h.symbol === selectedStock.symbol) ?? null
    : null;
  const watchedSymbols = watchlist.map(w => w.symbol);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="border-b border-gray-800 px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-blue-400 font-bold text-base">TC</span>
          <span className="font-semibold text-sm hidden sm:block">Tradecraft</span>
        </div>

        {/* Competition tabs */}
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {competitions.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                activeIdx === i ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {c.competition?.name ?? "Competition"}
            </button>
          ))}
        </div>

        <button
          onClick={handleSignOut}
          className="text-gray-500 hover:text-white text-xs ml-auto shrink-0"
        >
          Sign out
        </button>
      </header>

      {/* ── Ticker bar ── */}
      {stocks.length > 0 && (
        <div className="shrink-0 border-b border-gray-800">
          <TickerBar stocks={stocks} onSelect={setSelectedStock} />
        </div>
      )}

      {/* ── Main 3-column layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Portfolio */}
        <aside className="w-72 border-r border-gray-800 overflow-y-auto shrink-0 hidden lg:block">
          {participant && (
            <Portfolio
              participant={participant}
              holdings={holdings}
              prices={stocks}
              startingCash={competition?.starting_cash ?? 10000}
              onSelectSymbol={(sym) => setSelectedStock(stocks.find(s => s.symbol === sym) ?? null)}
            />
          )}
        </aside>

        {/* Center: Chart + tabs */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div className="flex gap-1 px-3 pt-2 pb-0 border-b border-gray-800 shrink-0 overflow-x-auto">
            {([
              ["chart",      "Chart"],
              ["history",    "History"],
              ["leaderboard","Leaderboard"],
              ["news",       "News"],
              ["ai",         "AI Advisor"],
              ["watchlist",  "Watchlist"],
              ["limits",     "Limit Orders"],
              ["alerts",     "Alerts"],
            ] as [CenterTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCenterTab(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t whitespace-nowrap transition-colors ${
                  centerTab === key
                    ? "bg-gray-800 text-white border-t border-l border-r border-gray-700"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {centerTab === "chart" && selectedStock && (
              <TradingChart
                symbol={selectedStock.symbol}
                companyName={selectedStock.company_name ?? selectedStock.symbol}
                currentPrice={selectedStock.price}
                changePercent={selectedStock.change_percent ?? 0}
              />
            )}
            {centerTab === "chart" && !selectedStock && (
              <div className="flex items-center justify-center h-full text-gray-600">Select a stock to view its chart</div>
            )}
            {centerTab === "history" && participantId && (
              <TradeHistory participantId={participantId} trades={trades} stocks={stocks} />
            )}
            {centerTab === "leaderboard" && competition && (
              <Leaderboard
                entries={leaderboard}
                currentUserId={userId}
                startingCash={competition.starting_cash}
                endDate={competition.end_date}
                competitionId={competition.id}
                onBotsChanged={loadAll}
              />
            )}
            {centerTab === "news" && selectedStock && (
              <NewsPanel symbol={selectedStock.symbol} />
            )}
            {centerTab === "news" && !selectedStock && (
              <NewsPanel symbol="SPY" />
            )}
            {centerTab === "ai" && participant && selectedStock && (
              <AIAdvisor
                participant={participant}
                holdings={holdings}
                selectedStock={selectedStock}
                prices={stocks}
              />
            )}
            {centerTab === "watchlist" && userId && (
              <Watchlist
                watchlist={watchlist}
                stocks={stocks}
                onSelect={setSelectedStock}
                onRemove={(sym) => handleToggleWatch(sym)}
              />
            )}
            {centerTab === "limits" && participantId && (
              <LimitOrders participantId={participantId} stocks={stocks} onExecuted={loadAll} />
            )}
            {centerTab === "alerts" && userId && (
              <PriceAlerts userId={userId} stocks={stocks} />
            )}
          </div>
        </main>

        {/* Right: Stock list + Trade panel */}
        <aside className="w-80 border-l border-gray-800 flex flex-col overflow-hidden shrink-0">
          <div className="flex-1 overflow-y-auto">
            <StockList
              stocks={stocks}
              selectedSymbol={selectedStock?.symbol ?? ""}
              onSelect={setSelectedStock}
              watchedSymbols={watchedSymbols}
              onToggleWatch={handleToggleWatch}
            />
          </div>
          {selectedStock && participant && (
            <div className="border-t border-gray-800 shrink-0">
              <TradePanel
                stock={selectedStock}
                participant={participant}
                holding={selectedHolding}
                onTradeComplete={handleTradeComplete}
              />
            </div>
          )}
        </aside>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
