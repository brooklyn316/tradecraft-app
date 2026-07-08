"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getAllStockPrices, getUserCompetitions, getHoldings, getRecentTrades,
} from "@/lib/stockApi";
import type {
  StockPrice, CompetitionParticipant, Competition,
  Holding, Trade, LeaderboardEntry, ShortPosition,
} from "@/types";

import TickerBar        from "@/components/TickerBar";
import MarketStatusBar  from "@/components/MarketStatusBar";
import StockSearch      from "@/components/StockSearch";
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
import AutomationRules  from "@/components/AutomationRules";
import PriceAlerts      from "@/components/PriceAlerts";
import CompetitionSetup from "@/components/CompetitionSetup";
import StockPredict     from "@/components/StockPredict";
import MarketEvents     from "@/components/MarketEvents";
import MarketSignals    from "@/components/MarketSignals";
import IPOPanel        from "@/components/IPOPanel";
import DayTradingHUD    from "@/components/DayTradingHUD";
import PredictionBets  from "@/components/PredictionBets";
import BracketView     from "@/components/BracketView";
import OptionsPanel    from "@/components/OptionsPanel";
import DailyChallenge  from "@/components/DailyChallenge";
import StreakBadges       from "@/components/StreakBadges";
import GlobalLeaderboard  from "@/components/GlobalLeaderboard";
import SectorRotation     from "@/components/SectorRotation";
import MarketWealth       from "@/components/MarketWealth";
import CopyTradeModal     from "@/components/CopyTradeModal";
import TradeJournal       from "@/components/TradeJournal";
import { CRYPTO_SYMBOLS } from "@/lib/crypto-prices";

type BottomTab = "markets" | "trending" | "watchlist" | "alerts" | "competition" | "activity" | "news" | "sectors" | "ipo" | "challenge" | "global";
type RightTab  = "trade" | "portfolio" | "history" | "ai" | "orders" | "automation" | "picks" | "predict" | "options" | "wealth" | "journal";

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
  const [shortPositions, setShortPositions] = useState<ShortPosition[]>([]);
  const [trades, setTrades]             = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([]);
  const [participantSnapshots, setParticipantSnapshots] = useState<ParticipantSnapshot[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [mwBalance, setMwBalance]       = useState<number | null>(null);

  // ── UI ────────────────────────────────────────────────────
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [bottomTab, setBottomTab]         = useState<BottomTab>("competition");
  const [rightTab,  setRightTab]          = useState<RightTab>("trade");
  const [predictStock, setPredictStock]   = useState<{ symbol: string; price: number } | null>(null);
  const [copied, setCopied]               = useState(false);
  const [copyTrade, setCopyTrade]         = useState<{ symbol: string; action: "buy" | "sell"; shares: number } | null>(null);
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [activityFeed, setActivityFeed]     = useState<Array<{
    username: string; is_bot: boolean; bot_strategy: string | null;
    symbol: string; action: string; shares: number; price: number;
    executed_at: string; isNew: boolean;
  }>>([]);
  const refreshRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTradeTimeRef = useRef<string | null>(null);

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
      const [comps, allStocks, mwRes] = await Promise.all([
        getUserCompetitions(userId),
        getAllStockPrices(),
        fetch(`/api/market-wealth?userId=${userId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (mwRes) setMwBalance(mwRes.balance ?? 0);
      setStocks(allStocks);

      const active = (comps as any[]).filter(c => c.competition?.status === "active");
      setCompetitions(active as any);

      if (active[activeIdx]) {
        const comp = active[activeIdx];
        const pid  = comp.id;
        const cid  = comp.competition?.id;

        const [h, t] = await Promise.all([getHoldings(pid), getRecentTrades(pid)]);
        setHoldings(h as Holding[]);
        setTrades(t as Trade[]);

        // Fetch short positions
        const { data: shorts } = await supabase
          .from("short_positions")
          .select("*")
          .eq("participant_id", pid);
        setShortPositions((shorts ?? []) as ShortPosition[]);

        if (cid) {
          const { data: participants } = await supabase
            .from("competition_participants")
            .select("id, user_id, is_bot, bot_strategy, cash_balance, margin_limit, profiles(username)")
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

            const snapshots: ParticipantSnapshot[] = (participants as any[]).map(p => ({
              id:           p.id,
              user_id:      p.user_id,
              is_bot:       p.is_bot,
              bot_strategy: p.bot_strategy,
              username:     p.is_bot
                              ? (p.bot_strategy ? p.bot_strategy.charAt(0).toUpperCase() + p.bot_strategy.slice(1) + " Bot" : "Bot")
                              : ((p.profiles as any)?.username ?? "Player"),
              cash_balance: p.cash_balance,
              holdings:     holdingsByParticipant[p.id] ?? [],
            }));
            setParticipantSnapshots(snapshots);
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
    refreshRef.current = setInterval(loadAll, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [authReady, loadAll]);

  // ── Real-time bot activity polling (every 20s) ────────────
  useEffect(() => {
    if (!participantId || !competition) return;
    const pollNewTrades = async () => {
      try {
        const { data: compParticipants } = await supabase
          .from("competition_participants")
          .select("id, is_bot, bot_strategy, profiles(username)")
          .eq("competition_id", competition.id);
        if (!compParticipants?.length) return;

        const partIds = compParticipants.map((p: any) => p.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabase
          .from("trades")
          .select("participant_id, symbol, action, shares, price, executed_at")
          .in("participant_id", partIds)
          .order("executed_at", { ascending: false })
          .limit(10);

        if (lastTradeTimeRef.current) {
          query = query.gt("executed_at", lastTradeTimeRef.current);
        }

        const { data: newTrades } = await query;
        if (!newTrades?.length) return;

        const BOT_DISPLAY: Record<string, string> = { index:"The Indexer", momentum:"Surge", random:"Wildcard" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const partMap: Record<string, { username: string; is_bot: boolean; bot_strategy: string | null }> = {};
        for (const p of compParticipants as any[]) {
          partMap[p.id] = {
            username:     p.is_bot ? (BOT_DISPLAY[p.bot_strategy] ?? "Bot") : ((p.profiles as any)?.username ?? "Player"),
            is_bot:       p.is_bot,
            bot_strategy: p.bot_strategy,
          };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newRows = newTrades.map((t: any) => ({
          username:     partMap[t.participant_id]?.username ?? "Unknown",
          is_bot:       partMap[t.participant_id]?.is_bot ?? false,
          bot_strategy: partMap[t.participant_id]?.bot_strategy ?? null,
          symbol:       t.symbol,
          action:       t.action,
          shares:       t.shares,
          price:        t.price,
          executed_at:  t.executed_at,
          isNew:        true,
        }));

        lastTradeTimeRef.current = newRows[0].executed_at;
        setActivityFeed(prev => [...newRows, ...prev.slice(0, 58)]);
        // Only badge-increment for bot trades (player's own trades are obvious)
        setUnreadActivity(prev => bottomTab === "activity" ? 0 : prev + newRows.filter((r: any) => r.is_bot).length);
      } catch { /* silent */ }
    };

    const t = window.setInterval(pollNewTrades, 20_000);
    return () => window.clearInterval(t);
  }, [participantId, competition, supabase, bottomTab]);

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

  const selectedHolding = selectedStock
    ? holdings.find(h => h.symbol === selectedStock.symbol) ?? null
    : null;

  const selectedShortPosition = selectedStock
    ? shortPositions.find(s => s.symbol === selectedStock.symbol) ?? null
    : null;

  // ── Loading ───────────────────────────────────────────────
  if (!authReady || loading) {
    return (
      <div style={{ minHeight:"100vh", background:"#060a14", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:32, height:32, border:"2px solid #7dd3b0", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
          <p style={{ color:"rgba(232,234,240,0.45)", fontSize:13 }}>Loading Tradecraft…</p>
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
          <button onClick={handleSignOut} style={{ fontSize:12, color:"rgba(232,234,240,0.45)", background:"none", border:"none", cursor:"pointer" }}>Sign out</button>
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

  const isCrypto      = competition?.style === "crypto";
  const visibleStocks = isCrypto
    ? stocks.filter(s => CRYPTO_SYMBOLS.includes(s.symbol as typeof CRYPTO_SYMBOLS[number]))
    : stocks;
  const spy = isCrypto
    ? visibleStocks.find(s => s.symbol === "BTC")
    : visibleStocks.find(s => s.symbol === "SPY");

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
    flexShrink: 0,
    letterSpacing: "0.04em",
    color: active ? "#7dd3b0" : "rgba(232,234,240,0.45)",
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
          <span style={{ fontSize:10, color:"rgba(232,234,240,0.4)" }}>${s.price.toFixed(2)}</span>
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

  const sortedStocks = [...visibleStocks].filter(s => s.change_percent != null);
  const gainers = [...sortedStocks].sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0)).slice(0, 8);
  const losers  = [...sortedStocks].sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0)).slice(0, 8);

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
              {c.competition?.style === "day_trade" && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>⚡</span>}
              {c.competition?.style === "swing"     && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>📈</span>}
              {c.competition?.style === "bracket"   && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>🏆</span>}
              {c.competition?.style === "crypto"    && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.9 }}>₿</span>}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {mwBalance !== null && (
            <button
              onClick={() => setRightTab("wealth")}
              style={{
                fontSize:11, fontWeight:700, fontFamily:"monospace",
                color:"#fbbf24", background:"rgba(251,191,36,0.08)",
                border:"1px solid rgba(251,191,36,0.2)", borderRadius:8,
                padding:"5px 10px", cursor:"pointer", flexShrink:0,
              }}
            >
              💎 {mwBalance.toLocaleString()}
            </button>
          )}
          <button onClick={() => window.location.href = "/stats"}
            style={{ fontSize:11, fontWeight:600, color:"rgba(232,234,240,0.55)", background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"5px 11px", cursor:"pointer" }}>
            📊 Stats
          </button>
          <button onClick={handleSignOut}
            style={{ fontSize:11, color:"rgba(232,234,240,0.4)", background:"none", border:"none", cursor:"pointer" }}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Ticker bar ── */}
      {visibleStocks.length > 0 && (
        <TickerBar stocks={visibleStocks} onSelect={handleTickerSelect} />
      )}

      {/* ── Market status pills ── */}
      <MarketStatusBar />

      {/* ── Day trading HUD ── */}
      {competition?.style === "day_trade" && participant && (
        <DayTradingHUD
          participant={participant}
          holdings={holdings}
          prices={visibleStocks}
          trades={trades}
          startingCash={competition.starting_cash}
        />
      )}

      {/* ── Main layout ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

        {/* ══ CENTER: Chart + bottom tabs ══ */}
        <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Chart area — grows to fill */}
          <div style={{ flex:1, overflow:"hidden", position:"relative", minHeight:0 }}>
            {/* StockPredict overlay */}
            {predictStock && (
              <StockPredict
                symbol={predictStock.symbol}
                currentPrice={predictStock.price}
                onClose={() => setPredictStock(null)}
              />
            )}

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
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"rgba(232,234,240,0.4)", fontSize:13 }}>
                Select a stock to view its chart
              </div>
            )}
          </div>

          {/* Bottom tab bar */}
          <div style={{
            display: "flex",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            background: "rgba(255,255,255,0.01)",
            overflowX: "auto",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            msOverflowStyle: "none",
          }}>
            {([
              ["markets",     "LIVE MARKETS"],
              ["trending",    "TRENDING"],
              ["watchlist",   "★ WATCHLIST"],
              ["alerts",      "🔔 ALERTS"],
              ["competition", "COMPETITION"],
              ["ipo",         "🚀 IPO"],
              ["challenge",   "🏆 DAILY"],
              ["global",      "🌍 GLOBAL"],
              ["activity",    "⚡ ACTIVITY"],
              ["news",        "📰 NEWS"],
              ["sectors",     "SECTORS"],
            ] as [BottomTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => { setBottomTab(key); if (key === "activity") setUnreadActivity(0); }}
                style={{ ...tabBtn(bottomTab === key), position:"relative" }}>
                {label}
                {key === "activity" && unreadActivity > 0 && (
                  <span style={{
                    position:"absolute", top:5, right:4,
                    background:"#f87171", color:"white",
                    fontSize:8, fontWeight:800, borderRadius:99,
                    padding:"1px 4px", lineHeight:"14px",
                    minWidth:14, textAlign:"center",
                  }}>{unreadActivity}</span>
                )}
              </button>
            ))}
          </div>

          {/* Bottom content panel */}
          <div style={{ height: 300, overflowY: "auto", flexShrink: 0 }}>

            {bottomTab === "markets" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <StockSearch
                  onSelect={(symbol, name) => {
                    const existing = stocks.find(s => s.symbol === symbol);
                    if (existing) {
                      setSelectedStock(existing);
                    } else {
                      // Stock not in current list — create a stub so chart can load
                      setSelectedStock({ symbol, company_name: name, price: 0, change_percent: 0, updated_at: new Date().toISOString() } as StockPrice);
                    }
                  }}
                />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <StockList
                    stocks={visibleStocks}
                    selectedSymbol={selectedStock?.symbol ?? ""}
                    onSelect={(stock) => setSelectedStock(stock)}
                  />
                </div>
              </div>
            )}

            {bottomTab === "trending" && (
              <div style={{ display:"flex", height:"100%" }}>
                <div style={{ flex:1, overflowY:"auto" }}>
                  <div style={{ padding:"7px 12px 3px", fontSize:9, fontWeight:700, color:"#4ade80", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    ▲ Top Gainers
                  </div>
                  {gainers.map(s => <MoverRow key={s.symbol} s={s} />)}
                </div>
                <div style={{ flex:1, overflowY:"auto", borderLeft:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ padding:"7px 12px 3px", fontSize:9, fontWeight:700, color:"#f87171", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                    ▼ Top Losers
                  </div>
                  {losers.map(s => <MoverRow key={s.symbol} s={s} />)}
                </div>
              </div>
            )}

            {bottomTab === "watchlist" && userId && (
              <Watchlist
                userId={userId}
                stocks={visibleStocks}
                onSelect={(stock) => setSelectedStock(stock)}
              />
            )}

            {bottomTab === "alerts" && userId && (
              <PriceAlerts
                userId={userId}
                stocks={visibleStocks}
                refreshKey={refreshKey}
                onSelectSymbol={(sym) => setSelectedStock(stocks.find(s => s.symbol === sym) ?? null)}
              />
            )}

            {bottomTab === "competition" && competition && competition.style === "bracket" && (
              <BracketView
                competitionId={competition.id}
                currentUserId={userId}
                startingCash={competition.starting_cash}
                stocks={visibleStocks}
              />
            )}

            {bottomTab === "competition" && competition && competition.style !== "bracket" && (
              <Leaderboard
                entries={leaderboard}
                currentUserId={userId}
                startingCash={competition.starting_cash}
                endDate={competition.end_date}
                competitionId={competition.id}
                onBotsChanged={loadAll}
              />
            )}

            {bottomTab === "ipo" && competition && (
              <IPOPanel
                competitionId={competition.id}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {bottomTab === "challenge" && participant && competition && userId && (
              <>
                <DailyChallenge
                  participantId={participant.id}
                  startingCash={competition.starting_cash}
                />
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <StreakBadges
                    userId={userId}
                    participantId={participant.id}
                  />
                </div>
              </>
            )}

            {bottomTab === "global" && (
              <GlobalLeaderboard currentUserId={userId} />
            )}

            {bottomTab === "activity" && (() => {
              const BOT_META_FEED: Record<string, { color: string; emoji: string }> = {
                index:    { color:"#60a5fa", emoji:"🏦" },
                momentum: { color:"#f59e0b", emoji:"⚡" },
                random:   { color:"#a78bfa", emoji:"🎲" },
              };
              const buyVerbs  = ["went long on", "just bought", "snapped up", "picked up"];
              const sellVerbs = ["dumped", "just sold", "offloaded", "exited"];
              const rng = (arr: string[], seed: string) => arr[seed.charCodeAt(0) % arr.length];
              return (
                <div>
                  {activityFeed.length === 0 ? (
                    <div style={{ padding:24, textAlign:"center", color:"rgba(232,234,240,0.45)", fontSize:12 }}>
                      No trades yet — be the first to make a move.
                    </div>
                  ) : activityFeed.map((t, i) => {
                    const buy  = t.action === "buy";
                    const bot  = t.is_bot && t.bot_strategy ? BOT_META_FEED[t.bot_strategy] : null;
                    const nameColor = bot ? bot.color : "rgba(232,234,240,0.85)";
                    const verb = buy ? rng(buyVerbs, t.symbol + i) : rng(sellVerbs, t.symbol + i);
                    const total = (t.shares * t.price).toLocaleString("en-US", { maximumFractionDigits:0 });
                    return (
                      <div key={i} style={{
                        padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.04)",
                        background: t.isNew ? "rgba(125,211,176,0.04)" : "transparent",
                        transition:"background 2s ease",
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                          {bot && <span style={{ fontSize:13 }}>{bot.emoji}</span>}
                          <span style={{ fontSize:12, fontWeight:700, color:nameColor }}>{t.username}</span>
                          <span style={{ fontSize:11, color: buy ? "#4ade80" : "#f87171", fontWeight:600 }}>{verb}</span>
                          <span style={{ fontSize:12, fontWeight:800, fontFamily:"monospace", color:"rgba(232,234,240,0.9)" }}>{t.symbol}</span>
                          {t.isNew && (
                            <span style={{ fontSize:8, fontWeight:800, padding:"1px 5px", borderRadius:3,
                              background:"rgba(125,211,176,0.15)", color:"#7dd3b0", letterSpacing:"0.06em" }}>NEW</span>
                          )}
                          <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(232,234,240,0.4)", whiteSpace:"nowrap" }}>
                            {timeAgo(t.executed_at)}
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, paddingLeft: bot ? 20 : 0 }}>
                          <span style={{ fontSize:10, color:"rgba(232,234,240,0.5)", fontFamily:"monospace" }}>
                            {t.shares} shares @ ${t.price.toFixed(2)}
                          </span>
                          <span style={{ fontSize:10, fontWeight:700, fontFamily:"monospace",
                            color: buy ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)" }}>
                            ${total}
                          </span>
                          <div style={{ marginLeft:"auto", display:"flex", gap:5 }}>
                            <button
                              onClick={() => { const s = stocks.find(st => st.symbol === t.symbol); if (s) { setSelectedStock(s); setRightTab("trade"); } }}
                              style={{ padding:"2px 8px", fontSize:9, borderRadius:5, cursor:"pointer",
                                background:"rgba(125,211,176,0.07)", border:"1px solid rgba(125,211,176,0.2)", color:"#7dd3b0", fontWeight:700 }}>
                              Chart →
                            </button>
                            <button
                              onClick={() => setCopyTrade({ symbol: t.symbol, action: t.action as "buy" | "sell", shares: t.shares })}
                              style={{ padding:"2px 8px", fontSize:9, borderRadius:5, cursor:"pointer",
                                background: t.action === "buy" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                                border: t.action === "buy" ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(248,113,113,0.2)",
                                color: t.action === "buy" ? "#4ade80" : "#f87171", fontWeight:700 }}>
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <style>{`@keyframes _pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                </div>
              );
            })()}

            {bottomTab === "news" && (
              <NewsPanel
                symbol={selectedStock?.symbol ?? "SPY"}
                companyName={selectedStock?.company_name ?? selectedStock?.symbol ?? "S&P 500"}
              />
            )}

            {bottomTab === "sectors" && (
              <SectorRotation
                participantId={participantId}
                stocks={visibleStocks}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

          </div>
        </main>

        {/* ══ RIGHT PANEL: Trade / Portfolio / History / AI / Orders ══ */}
        <aside style={{
          width: 300,
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
              ["picks",     "📈 Picks"],
              ["predict",   "🎯 Predict"],
              ["ai",        "✦ AI"],
              ["options",    "⚙ Options"],
              ["wealth",     "💎 Wealth"],
              ["journal",    "📓 Journal"],
              ["orders",     "Orders"],
              ["automation", "⚡ Auto"],
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
                color: rightTab === key ? "#7dd3b0" : "rgba(232,234,240,0.45)",
                borderBottom: rightTab === key ? "2px solid #7dd3b0" : "2px solid transparent",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto" }}>

            {rightTab === "trade" && (
              selectedStock && participant ? (
                <TradePanel
                  stock={selectedStock}
                  participant={participant}
                  holding={selectedHolding}
                  shortPosition={selectedShortPosition}
                  marginLimit={participant.margin_limit ?? 0}
                  onTradeComplete={handleTradeComplete}
                />
              ) : (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:120, color:"rgba(232,234,240,0.35)", fontSize:12 }}>
                  Select a stock to trade
                </div>
              )
            )}

            {rightTab === "portfolio" && participant && (
              <Portfolio
                participant={participant}
                holdings={holdings}
                shortPositions={shortPositions}
                prices={visibleStocks}
                startingCash={competition?.starting_cash ?? 10000}
                marginLimit={participant.margin_limit ?? 0}
                competitionStyle={competition?.style ?? "standard"}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {rightTab === "history" && participantId && (
              <TradeHistory participantId={participantId} />
            )}

            {rightTab === "picks" && participant && (
              <MarketSignals
                stocks={visibleStocks}
                holdings={holdings}
                cashBalance={participant.cash_balance}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {rightTab === "predict" && participant && (
              <PredictionBets
                participant={participant}
                stocks={visibleStocks}
                selectedStock={selectedStock}
                onTradeComplete={handleTradeComplete}
              />
            )}

            {rightTab === "ai" && participant && (
              <AIAdvisor
                participant={participant}
                holdings={holdings}
                stocks={visibleStocks}
                recentTrades={trades}
                startingCash={competition?.starting_cash ?? 10000}
                onSelectSymbol={(sym) => {
                  setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                  setRightTab("trade");
                }}
              />
            )}

            {rightTab === "options" && participant && (
              <OptionsPanel
                participant={participant}
                stocks={visibleStocks}
                selectedStock={selectedStock}
                onSelectStock={(sym) => setSelectedStock(stocks.find(s => s.symbol === sym) ?? null)}
                onTradeComplete={handleTradeComplete}
              />
            )}

            {rightTab === "wealth" && userId && (
              <MarketWealth userId={userId} />
            )}

            {rightTab === "journal" && participantId && (
              <TradeJournal
                participantId={participantId}
                competitionEnded={competition?.status === "completed"}
              />
            )}

            {rightTab === "orders" && participantId && (
              <LimitOrders
                participantId={participantId}
                refreshKey={refreshKey}
                onOrderFilled={loadAll}
              />
            )}

            {rightTab === "automation" && participantId && competition && participant && (
              <AutomationRules
                participantId={participantId}
                competitionId={competition.id}
                stocks={visibleStocks}
                cashBalance={participant.cash_balance}
                refreshKey={refreshKey}
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
              <div style={{ fontSize:9, fontWeight:700, color:"rgba(232,234,240,0.35)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>
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

      {/* ── Copy-trade modal ── */}
      {copyTrade && participant && (
        <CopyTradeModal
          symbol={copyTrade.symbol}
          action={copyTrade.action}
          origShares={copyTrade.shares}
          currentPrice={stocks.find(s => s.symbol === copyTrade.symbol)?.price ?? 0}
          participant={{ id: participant.id, cash_balance: participant.cash_balance }}
          currentHolding={holdings.find(h => h.symbol === copyTrade.symbol)?.shares ?? 0}
          onClose={() => setCopyTrade(null)}
          onSuccess={() => { setCopyTrade(null); handleTradeComplete(); }}
        />
      )}

    </div>
  );
}
