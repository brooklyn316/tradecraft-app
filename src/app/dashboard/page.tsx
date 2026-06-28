"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getAllStockPrices, getUserCompetitions, getHoldings, getRecentTrades,
} from "@/lib/stockApi";
import type {
  StockPrice, CompetitionParticipant, Competition,
  Holding, Trade, LeaderboardEntry,
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
import StockPredict     from "@/components/StockPredict";
import StockSearch      from "@/components/StockSearch";
import MarketEvents     from "@/components/MarketEvents";

type BottomTab = "markets" | "trending" | "watchlist" | "alerts" | "competition" | "activity";
type RightTab  = "trade" | "portfolio" | "history" | "ai" | "orders";
type NewsTab   = "news" | "sectors";

interface ParticipantSnapshot {
  id: string;
  user_id: string;
  is_bot: boolean;
  bot_strategy: string | null;
  username: string;
  cash_balance: number;
  holdings: { symbol: string; shares: number }[];
}

export default function DashboardPage() {
  const supabase = getSupabaseClient();

  // ── Auth ──────────────────────────────────────────────────
  const [userId, setUserId]       = useState<string | null>(null);
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
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([]);
  const [participantSnapshots, setParticipantSnapshots] = useState<ParticipantSnapshot[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());
  const [activityFeed, setActivityFeed] = useState<Array<{
    username: string; is_bot: boolean; symbol: string;
    action: string; shares: number; price: number; executed_at: string;
  }>>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [countdown, setCountdown]       = useState(60);

  // ── UI ────────────────────────────────────────────────────
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [bottomTab, setBottomTab]         = useState<BottomTab>("competition");
  const [rightTab,  setRightTab]          = useState<RightTab>("trade");
  const [newsTab,   setNewsTab]           = useState<NewsTab>("news");
  const [predictStock, setPredictStock]   = useState<{ symbol: string; price: number } | null>(null);
  const [copied, setCopied]               = useState(false);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const participant   = competitions[activeIdx] ?? null;
  const competition   = participant?.competition ?? null;
  const participantId = participant?.id ?? null;

  // ── Live leaderboard ──────────────────────────────────────
  useEffect(() => {
    if (!participantSnapshots.length || !stocks.length || !competition) return;
    const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.price]));
    const startingCash = competition.starting_cash;

    const entries: LeaderboardEntry[] = participantSnapshots.map(p => {
      const portfolioValue = p.holdings.reduce(
        (sum, h) => sum + h.shares * (priceMap[h.symbol] ?? 0), 0
      );
      const total = p.cash_balance + portfolioValue;
      return {
        participant_id:  p.id,
        user_id:         p.user_id,
        is_bot:          p.is_bot,
        bot_strategy:    p.bot_strategy,
        username:        p.username,
        cash_balance:    p.cash_balance,
        portfolio_value: portfolioValue,
        total_value:     total,
        return_amount:   total - startingCash,
        return_percent:  ((total - startingCash) / startingCash) * 100,
        rank:            0,
      };
    });

    entries.sort((a, b) => b.total_value - a.total_value);
    entries.forEach((e, i) => { e.rank = i + 1; });
    setLeaderboard(entries);
  }, [stocks, participantSnapshots, competition]);

  // ── Main load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [comps, allStocks] = await Promise.all([
        getUserCompetitions(userId),
        getAllStockPrices(),
      ]);
      setStocks(allStocks);

      // Load watchlist symbols for Watch Picks
      if (userId) {
        const { data: wl } = await supabase
          .from("watchlist")
          .select("symbol")
          .eq("user_id", userId);
        setWatchlistSymbols(new Set((wl ?? []).map((w: any) => w.symbol)));
      }

      const active = (comps as any[]).filter(c => c.competition?.status === "active");
      setCompetitions(active as any);

      if (active[activeIdx]) {
        const comp = active[activeIdx];
        const pid  = comp.id;
        const cid  = comp.competition?.id;

        const [h, t] = await Promise.all([getHoldings(pid), getRecentTrades(pid)]);
        setHoldings(h as Holding[]);
        setTrades(t as Trade[]);

        if (cid) {
          const { data: participants } = await supabase
            .from("competition_participants")
            .select("id, user_id, is_bot, bot_strategy, cash_balance, profiles(username)")
            .eq("competition_id", cid);

          if (participants?.length) {
            const { data: allHoldings } = await supabase
              .from("holdings")
              .select("participant_id, symbol, shares")
              .in("participant_id", participants.map((p: any) => p.id));

            const holdingsByParticipant: Record<string, { symbol: string; shares: number }[]> = {};
            for (const h of (allHoldings ?? [])) {
              if (!holdingsByParticipant[h.participant_id]) holdingsByParticipant[h.participant_id] = [];
              holdingsByParticipant[h.participant_id].push({ symbol: h.symbol, shares: h.shares });
            }

            const BOT_DISPLAY_NAMES: Record<string, string> = {
              index:    "The Indexer",
              momentum: "Surge",
              random:   "Wildcard",
            };

            const snapshots: ParticipantSnapshot[] = (participants as any[]).map(p => ({
              id:           p.id,
              user_id:      p.user_id,
              is_bot:       p.is_bot,
              bot_strategy: p.bot_strategy,
              username:     p.is_bot
                              ? (BOT_DISPLAY_NAMES[p.bot_strategy] ?? "Bot")
                              : ((p.profiles as any)?.username ?? "Player"),
              cash_balance: p.cash_balance,
              holdings:     holdingsByParticipant[p.id] ?? [],
            }));
            setParticipantSnapshots(snapshots);

            // Activity feed: last 60 trades across all participants
            const { data: feedTrades } = await supabase
              .from("trades")
              .select("participant_id, symbol, action, shares, price, executed_at")
              .in("participant_id", participants.map((p: any) => p.id))
              .order("executed_at", { ascending: false })
              .limit(60);

            const usernameMap: Record<string, { username: string; is_bot: boolean }> = {};
            for (const snap of snapshots) usernameMap[snap.id] = { username: snap.username, is_bot: snap.is_bot };

            setActivityFeed(
              (feedTrades ?? []).map((t: any) => ({
                username: usernameMap[t.participant_id]?.username ?? "Unknown",
                is_bot:   usernameMap[t.participant_id]?.is_bot ?? false,
                symbol:   t.symbol,
                action:   t.action,
                shares:   t.shares,
                price:    t.price,
                executed_at: t.executed_at,
              }))
            );
          }
        }
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, activeIdx, supabase]);

  useEffect(() => {
    if (!authReady) return;
    loadAll();
    setCountdown(60);
    refreshRef.current = setInterval(() => { loadAll(); setCountdown(60); }, 60_000);
    countdownRef.current = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [authReady, loadAll]);

  const handleTradeComplete = useCallback(() => {
    setRefreshKey(k => k + 1);
    setTimeout(loadAll, 500);
  }, [loadAll]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  const handleCopyInvite = useCallback(() => {
    if (!competition?.invite_code) return;
    const url = `${window.location.origin}/join/${competition.invite_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [competition]);

  const handleTickerSelect = useCallback((stock: StockPrice) => {
    setSelectedStock(stock);
  }, []);

  const handleSymbolSearch = useCallback(async (symbol: string, companyName: string) => {
    // Use existing data if we already have it
    const existing = stocks.find(s => s.symbol === symbol);
    if (existing) { setSelectedStock(existing); return; }
    // Fetch live price for stocks not in our default list
    try {
      const res = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (data.price) setSelectedStock(data as StockPrice);
    } catch (err) {
      console.error("Failed to fetch price for", symbol, err);
    }
  }, [stocks]);

  const selectedHolding = selectedStock
    ? holdings.find(h => h.symbol === selectedStock.symbol) ?? null
    : null;

  // ── Loading ───────────────────────────────────────────────
  if (!authReady || loading) {
    return (
      <div style={{ minHeight:"100vh", background:"#060a14", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:32, height:32, border:"2px solid #7dd3b0", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
          <p style={{ color:"rgba(232,234,240,0.65)", fontSize:13 }}>Loading Tradecraft…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── No active competition ─────────────────────────────────
  if (competitions.length === 0) {
    return (
      <div style={{ minHeight:"100vh", background:"#060a14", color:"#e8eaf0", display:"flex", flexDirection:"column" }}>
        <header style={{ borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"0 24px", height:50, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:"#7dd3b0", fontWeight:800, fontSize:17, letterSpacing:"-0.02em" }}>TC</span>
            <span style={{ fontWeight:600, fontSize:14 }}>Tradecraft</span>
          </div>
          <button onClick={handleSignOut} style={{ fontSize:12, color:"rgba(232,234,240,0.65)", background:"none", border:"none", cursor:"pointer" }}>Sign out</button>
        </header>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ maxWidth:480, width:"100%" }}>
            <h1 style={{ fontSize:24, fontWeight:700, marginBottom:8, textAlign:"center" }}>Welcome to Tradecraft</h1>
            <p style={{ color:"rgba(232,234,240,0.5)", textAlign:"center", marginBottom:32 }}>Start a competition to begin trading</p>
            <CompetitionSetup userId={userId!} onCreated={() => loadAll()} />
          </div>
        </div>
      </div>
    );
  }

  const spy      = stocks.find(s => s.symbol === "SPY");
  const username = participantSnapshots.find(p => p.user_id === userId)?.username ?? "";

  // ── Time helper ───────────────────────────────────────────
  function timeAgo(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ── Shared button styles ──────────────────────────────────
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    whiteSpace: "nowrap",
    letterSpacing: "0.04em",
    color: active ? "#7dd3b0" : "rgba(232,234,240,0.65)",
    borderBottom: active ? "2px solid #7dd3b0" : "2px solid transparent",
    transition: "all 0.15s",
  });

  // ── Movers helper ─────────────────────────────────────────
  const MoverRow = ({ s }: { s: StockPrice }) => {
    const up = (s.change_percent ?? 0) >= 0;
    return (
      <div style={{ display:"flex", alignItems:"center", padding:"7px 12px", borderBottom:"1px solid rgba(255,255,255,0.04)", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <span style={{ fontSize:12, fontWeight:800, marginRight:6, color:"rgba(232,234,240,0.9)" }}>{s.symbol}</span>
          <span style={{ fontSize:10, color:"rgba(232,234,240,0.60)" }}>${s.price.toFixed(2)}</span>
        </div>
        <span style={{ fontSize:12, fontWeight:700, color: up ? "#4ade80" : "#f87171", flexShrink:0 }}>
          {up ? "+" : ""}{(s.change_percent ?? 0).toFixed(2)}%
        </span>
        <button
          onClick={() => setSelectedStock(s)}
          style={{ padding:"2px 7px", fontSize:10, borderRadius:4, cursor:"pointer",
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(232,234,240,0.6)", flexShrink:0 }}
        >Chart</button>
        <button
          onClick={() => setPredictStock({ symbol: s.symbol, price: s.price })}
          style={{ padding:"2px 7px", fontSize:10, borderRadius:4, cursor:"pointer",
            background:"rgba(125,211,176,0.08)", border:"1px solid rgba(125,211,176,0.25)", color:"#7dd3b0", flexShrink:0 }}
        >Predict</button>
      </div>
    );
  };

  const sortedStocks = [...stocks].filter(s => s.change_percent != null);
  const gainers    = [...sortedStocks].sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0)).slice(0, 8);
  const losers     = [...sortedStocks].sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0)).slice(0, 8);
  const watchPicks = [...sortedStocks]
    .filter(s => watchlistSymbols.has(s.symbol))
    .sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0))
    .slice(0, 6);

  return (
    <div style={{ minHeight:"100vh", background:"#060a14", color:"#e8eaf0", display:"flex", flexDirection:"column", overflow:"hidden", height:"100vh" }}>

      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "0 16px",
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        background: "rgba(255,255,255,0.015)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginRight:4, flexShrink:0 }}>
          <span style={{ color:"#7dd3b0", fontWeight:800, fontSize:17, letterSpacing:"-0.02em" }}>TC</span>
          <span style={{ fontWeight:600, fontSize:13, color:"rgba(232,234,240,0.9)" }}>Tradecraft</span>
        </div>

        <div style={{ display:"flex", gap:4, flex:1, overflowX:"auto" }}>
          {competitions.map((c, i) => (
            <button key={c.id} onClick={() => setActiveIdx(i)} style={{
              padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: activeIdx === i ? "1px solid rgba(125,211,176,0.35)" : "1px solid rgba(255,255,255,0.07)",
              background: activeIdx === i ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
              color: activeIdx === i ? "#7dd3b0" : "rgba(232,234,240,0.5)",
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}>
              {c.competition?.name ?? "Competition"}
            </button>
          ))}
        </div>

        <span style={{ fontSize:11, color:"rgba(232,234,240,0.55)", flexShrink:0, whiteSpace:"nowrap" }}>
          ● Refreshes in {countdown}s
        </span>

        {username && (
          <span style={{ fontSize:12, fontWeight:600, color:"rgba(232,234,240,0.7)", flexShrink:0 }}>
            {username}
          </span>
        )}

        <button onClick={handleSignOut}
          style={{ fontSize:11, color:"rgba(232,234,240,0.60)", background:"none", border:"none", cursor:"pointer", flexShrink:0 }}>
          Sign out
        </button>
      </header>

      {/* ── Ticker bar ── */}
      {stocks.length > 0 && (
        <TickerBar stocks={stocks} onSelect={handleTickerSelect} />
      )}

      {/* ── Main layout ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

        {/* ══ CENTER: Chart + bottom tabs ══ */}
        <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Chart area — fills remaining space above bottom panel */}
          <div style={{ flex:1, overflow:"hidden", position:"relative", minHeight:0 }}>

            {selectedStock ? (
              <TradingChart
                key={selectedStock.symbol}
                symbol={selectedStock.symbol}
                companyName={selectedStock.company_name ?? selectedStock.symbol}
                currentPrice={selectedStock.price}
                changePercent={selectedStock.change_percent ?? 0}
                onBack={() => setSelectedStock(null)}
              />
            ) : spy ? (
              <TradingChart
                key="overview-spy"
                symbol="SPY"
                companyName="SPDR S&P 500 ETF"
                currentPrice={spy.price}
                changePercent={spy.change_percent ?? 0}
                isOverview
              />
            ) : (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"rgba(232,234,240,0.60)", fontSize:13 }}>
                Select a stock to view its chart
              </div>
            )}
          </div>

          {/* Bottom section — 55% of center column, row: [tabs | news] */}
          <div style={{ flex:"0 0 55%", display:"flex", flexDirection:"row", borderTop:"1px solid rgba(255,255,255,0.06)", minHeight:0 }}>

          {/* Left: tab bar + content */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>

          {/* Tab bar */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            background: "rgba(255,255,255,0.01)",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}>
            {([
              ["markets",     "LIVE MARKETS"],
              ["trending",    "TRENDING"],
              ["watchlist",   "★ WATCHLIST"],
              ["alerts",      "🔔 ALERTS"],
              ["competition", "COMP"],
              ["activity",    "⚡ ACTIVITY"],
            ] as [BottomTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setBottomTab(key)} style={{
                padding: "8px 10px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                whiteSpace: "nowrap",
                letterSpacing: "0.04em",
                color: bottomTab === key ? "#7dd3b0" : "rgba(232,234,240,0.65)",
                borderBottom: bottomTab === key ? "2px solid #7dd3b0" : "2px solid transparent",
                transition: "all 0.15s",
                flexShrink: 0,
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Scrollable content inside the 38% section */}
          <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>

            {bottomTab === "markets" && (
              <StockList
                stocks={stocks}
                selectedSymbol={selectedStock?.symbol ?? ""}
                onSelect={(stock) => setSelectedStock(stock)}
              />
            )}

            {bottomTab === "trending" && (
              <div style={{ display:"flex", height:"100%" }}>

                {/* ── TOP GAINERS ── */}
                <div style={{ flex:1, overflowY:"auto", borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ padding:"7px 10px 4px", fontSize:9, fontWeight:700, color:"#4ade80", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    ▲ Top Gainers
                  </div>
                  {gainers.map(s => (
                    <div key={s.symbol} onClick={() => setSelectedStock(s)}
                      style={{ display:"flex", alignItems:"center", padding:"7px 10px 7px 8px",
                        borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer",
                        borderLeft:"2px solid #4ade80", gap:6 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, color:"rgba(232,234,240,0.9)" }}>{s.symbol}</div>
                        <div style={{ fontSize:10, color:"rgba(232,234,240,0.60)" }}>${s.price.toFixed(2)}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#4ade80", flexShrink:0 }}>
                        +{(s.change_percent ?? 0).toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── TOP LOSERS ── */}
                <div style={{ flex:1, overflowY:"auto", borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ padding:"7px 10px 4px", fontSize:9, fontWeight:700, color:"#f87171", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    ▼ Top Losers
                  </div>
                  {losers.map(s => (
                    <div key={s.symbol} onClick={() => setSelectedStock(s)}
                      style={{ display:"flex", alignItems:"center", padding:"7px 10px 7px 8px",
                        borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer",
                        borderLeft:"2px solid #f87171", gap:6 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, color:"rgba(232,234,240,0.9)" }}>{s.symbol}</div>
                        <div style={{ fontSize:10, color:"rgba(232,234,240,0.60)" }}>${s.price.toFixed(2)}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f87171", flexShrink:0 }}>
                        {(s.change_percent ?? 0).toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── WATCH PICKS ── */}
                <div style={{ flex:1, overflowY:"auto" }}>
                  <div style={{ padding:"7px 10px 4px", fontSize:9, fontWeight:700, color:"#fbbf24", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    ★ Watch Picks
                  </div>
                  {watchPicks.length === 0 ? (
                    <div style={{ padding:"12px 10px", fontSize:11, color:"rgba(232,234,240,0.50)", lineHeight:1.5 }}>
                      Add stocks to your watchlist to see picks here
                    </div>
                  ) : watchPicks.map(s => {
                    const up = (s.change_percent ?? 0) >= 0;
                    return (
                      <div key={s.symbol} onClick={() => setSelectedStock(s)}
                        style={{ display:"flex", alignItems:"center", padding:"7px 10px",
                          borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer", gap:7 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", flexShrink:0,
                          background: up ? "#4ade80" : "#f87171" }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:800, color:"rgba(232,234,240,0.9)" }}>{s.symbol}</div>
                          <div style={{ fontSize:10, color:"rgba(232,234,240,0.60)" }}>${s.price.toFixed(2)}</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:9, fontWeight:700, color: up ? "#4ade80" : "#f87171" }}>
                            {up ? "↑ Buy" : "↓ Sell"} signal
                          </div>
                          <div style={{ fontSize:11, fontWeight:700, color: up ? "#4ade80" : "#f87171" }}>
                            {up ? "+" : ""}{(s.change_percent ?? 0).toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            {bottomTab === "watchlist" && userId && (
              <Watchlist
                userId={userId}
                stocks={stocks}
                onSelect={(stock) => setSelectedStock(stock)}
              />
            )}

            {bottomTab === "alerts" && userId && (
              <PriceAlerts
                userId={userId}
                stocks={stocks}
                refreshKey={refreshKey}
                onSelectSymbol={(sym) => setSelectedStock(stocks.find(s => s.symbol === sym) ?? null)}
              />
            )}

            {bottomTab === "competition" && competition && (
              <Leaderboard
                entries={leaderboard}
                currentUserId={userId}
                startingCash={competition.starting_cash}
                endDate={competition.end_date}
                competitionId={competition.id}
                onBotsChanged={loadAll}
              />
            )}

            {bottomTab === "activity" && (
              <div>
                {activityFeed.length === 0 ? (
                  <div style={{ padding:24, textAlign:"center", color:"rgba(232,234,240,0.55)", fontSize:12 }}>
                    No trades yet — be the first to make a move!
                  </div>
                ) : activityFeed.map((t, i) => {
                  const buy = t.action === "buy";
                  return (
                    <div key={i} style={{
                      display:"flex", alignItems:"center", padding:"7px 14px",
                      borderBottom:"1px solid rgba(255,255,255,0.04)", gap:10,
                    }}>
                      {/* Colour dot */}
                      <div style={{ width:7, height:7, borderRadius:"50%", flexShrink:0,
                        background: buy ? "#4ade80" : "#f87171" }} />
                      {/* Who */}
                      <span style={{
                        fontSize:11, fontWeight:700, flexShrink:0,
                        color: t.is_bot ? "#a78bfa" : "rgba(232,234,240,0.9)",
                      }}>{t.username}</span>
                      {/* Action */}
                      <span style={{ fontSize:11, color: buy ? "#4ade80" : "#f87171", fontWeight:600, flexShrink:0 }}>
                        {buy ? "bought" : "sold"}
                      </span>
                      {/* Detail */}
                      <span style={{ fontSize:11, fontWeight:800, color:"rgba(232,234,240,0.85)", flexShrink:0 }}>
                        {t.shares}× {t.symbol}
                      </span>
                      <span style={{ fontSize:10, color:"rgba(232,234,240,0.60)", fontFamily:"monospace", flexShrink:0 }}>
                        @ ${t.price.toFixed(2)}
                      </span>
                      {/* Click to chart */}
                      <button
                        onClick={() => setSelectedStock(stocks.find(s => s.symbol === t.symbol) ?? null)}
                        style={{ padding:"1px 6px", fontSize:9, borderRadius:4, cursor:"pointer",
                          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                          color:"rgba(232,234,240,0.60)", flexShrink:0 }}
                      >Chart</button>
                      {/* Time — pushed right */}
                      <span style={{ marginLeft:"auto", fontSize:10, color:"rgba(232,234,240,0.50)", whiteSpace:"nowrap" }}>
                        {timeAgo(t.executed_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>{/* end scrollable content */}
          </div>{/* end left tabs column */}

          {/* News panel — same height as bottom section */}
          <div style={{
            width: 210,
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
          }}>
          {/* NEWS | SECTORS tabs */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            background: "rgba(255,255,255,0.01)",
          }}>
            {([["news","📰 NEWS"],["sectors","SECTORS"]] as [NewsTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setNewsTab(key)} style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                letterSpacing: "0.06em",
                color: newsTab === key ? "#7dd3b0" : "rgba(232,234,240,0.65)",
                borderBottom: newsTab === key ? "2px solid #7dd3b0" : "2px solid transparent",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto" }}>
            {newsTab === "news" ? (
              <NewsPanel
                symbol={selectedStock?.symbol ?? "SPY"}
                companyName={selectedStock?.company_name ?? selectedStock?.symbol ?? "S&P 500"}
              />
            ) : (() => {
              // Sector groups — average change_percent of member stocks
              const SECTOR_GROUPS = [
                { label: "Tech",        syms: ["AAPL","MSFT","GOOGL","AMD","NVDA","META","ADBE"] },
                { label: "EV & Auto",   syms: ["TSLA","RIVN","F","GM"] },
                { label: "E-commerce",  syms: ["AMZN","PYPL","COIN","UBER"] },
                { label: "Streaming",   syms: ["NFLX","SNAP"] },
                { label: "Index ETFs",  syms: ["SPY","QQQ"] },
                { label: "Finance",     syms: ["JPM","V","MA","BAC","WFC"] },
                { label: "Healthcare",  syms: ["JNJ","PFE","UNH"] },
                { label: "Energy",      syms: ["XOM","CVX"] },
                { label: "Consumer",    syms: ["WMT","KO","COST"] },
              ];
              const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s]));
              const sectors = SECTOR_GROUPS.map(g => {
                const members = g.syms.map(sym => priceMap[sym]).filter(Boolean);
                if (!members.length) return null;
                const avg = members.reduce((s, m) => s + (m.change_percent ?? 0), 0) / members.length;
                return { label: g.label, avg };
              }).filter((x): x is { label: string; avg: number } => x !== null);

              return (
                <div style={{ padding:"10px 0 0" }}>
                  <div style={{ padding:"0 14px 8px", fontSize:9, fontWeight:700,
                    color:"rgba(232,234,240,0.55)", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    Sector Performance
                  </div>
                  {sectors.map(({ label, avg }) => {
                    const up = avg >= 0;
                    const barW = Math.min(Math.abs(avg) / 4, 1) * 100; // cap at ±4%
                    return (
                      <div key={label} style={{ padding:"7px 14px 8px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"rgba(232,234,240,0.8)" }}>{label}</span>
                          <span style={{ fontSize:13, fontWeight:700, color: up ? "#4ade80" : "#f87171" }}>
                            {up ? "+" : ""}{avg.toFixed(2)}%
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,0.06)" }}>
                          <div style={{
                            height:"100%", borderRadius:2, width:`${barW}%`,
                            background: up ? "#4ade80" : "#f87171",
                            transition:"width 0.4s ease",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          </div>{/* end news panel */}
          </div>{/* end 38% bottom row */}
        </main>

        {/* ══ RIGHT PANEL: Trade / Portfolio / History / AI / Orders ══ */}
        <aside style={{
          width: 340,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {/* Tab bar */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            background: "rgba(255,255,255,0.01)",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}>
            {([
              ["trade",     "Trade"],
              ["portfolio", "Portfolio"],
              ["history",   "History"],
              ["ai",        "✦ AI"],
              ["orders",    "Orders"],
            ] as [RightTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setRightTab(key)} style={{
                flex: 1,
                padding: "10px 6px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                whiteSpace: "nowrap",
                color: rightTab === key ? "#7dd3b0" : "rgba(232,234,240,0.65)",
                borderBottom: rightTab === key ? "2px solid #7dd3b0" : "2px solid transparent",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* Stock search — pinned above content, only visible in Trade tab */}
          {rightTab === "trade" && (
            <StockSearch onSelect={handleSymbolSearch} />
          )}

          {/* Market events — always visible, shows real price movers + game events */}
          {stocks.length > 0 && (
            <MarketEvents
              stocks={stocks}
              holdings={holdings}
              onSelectStock={(stock) => {
                setSelectedStock(stock);
                setRightTab("trade");
              }}
              onSwitchToTrade={() => setRightTab("trade")}
            />
          )}

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto" }}>

            {rightTab === "trade" && (
              selectedStock && participant ? (
                <TradePanel
                  stock={selectedStock}
                  participant={participant}
                  holding={selectedHolding}
                  onTradeComplete={handleTradeComplete}
                />
              ) : (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:120, color:"rgba(232,234,240,0.55)", fontSize:12 }}>
                  Select a stock to trade
                </div>
              )
            )}

            {rightTab === "portfolio" && participant && (
              <Portfolio
                participant={participant}
                holdings={holdings}
                prices={stocks}
                startingCash={competition?.starting_cash ?? 10000}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {rightTab === "history" && participantId && (
              <TradeHistory participantId={participantId} />
            )}

            {rightTab === "ai" && participant && (
              <AIAdvisor
                participant={participant}
                holdings={holdings}
                stocks={stocks}
                recentTrades={trades}
                startingCash={competition?.starting_cash ?? 10000}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {rightTab === "orders" && participantId && (
              <LimitOrders
                participantId={participantId}
                refreshKey={refreshKey}
                onOrderFilled={loadAll}
              />
            )}

          </div>

          {/* Invite friends — pinned at bottom for friends competitions */}
          {competition?.mode === "friends" && competition?.invite_code && (
            <div style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "10px 14px",
              flexShrink: 0,
              background: "rgba(255,255,255,0.01)",
            }}>
              <div style={{ fontSize:9, fontWeight:700, color:"rgba(232,234,240,0.55)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>
                Invite Friends
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
                <div style={{
                  flex:1, fontFamily:"monospace", fontSize:13, fontWeight:800, color:"#7dd3b0",
                  letterSpacing:"0.12em", background:"rgba(125,211,176,0.05)",
                  border:"1px solid rgba(125,211,176,0.15)", borderRadius:6, padding:"6px 8px",
                }}>
                  {competition.invite_code}
                </div>
                <button onClick={handleCopyInvite} style={{
                  padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer",
                  background: copied ? "rgba(125,211,176,0.2)" : "rgba(125,211,176,0.08)",
                  border: `1px solid rgba(125,211,176,${copied ? "0.4" : "0.2"})`,
                  color:"#7dd3b0", transition:"all 0.2s",
                }}>
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
              <button onClick={handleCopyInvite} style={{
                width:"100%", padding:"7px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                background:"rgba(125,211,176,0.05)", border:"1px solid rgba(125,211,176,0.12)",
                color:"rgba(125,211,176,0.65)",
              }}>
                🔗 Share Invite
              </button>
            </div>
          )}

        </aside>

      </div>
    </div>
  );
}
