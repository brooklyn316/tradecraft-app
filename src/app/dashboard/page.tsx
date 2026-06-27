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

type CenterTab = "chart" | "history" | "leaderboard" | "news" | "ai" | "watchlist" | "limits" | "alerts";

interface ParticipantSnapshot {
  id: string;
  user_id: string;
  is_bot: boolean;
  bot_strategy: string | null;
  username: string;
  cash_balance: number;
  holdings: { symbol: string; shares: number }[];
}

const CENTER_TABS: [CenterTab, string][] = [
  ["chart",       "Chart"],
  ["history",     "History"],
  ["leaderboard", "Leaderboard"],
  ["news",        "News"],
  ["ai",          "AI"],
  ["watchlist",   "Watchlist"],
  ["limits",      "Limits"],
  ["alerts",      "Alerts"],
];

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
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  // ── UI ────────────────────────────────────────────────────
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [centerTab, setCenterTab]         = useState<CenterTab>("chart");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const participant   = competitions[activeIdx] ?? null;
  const competition   = participant?.competition ?? null;
  const participantId = participant?.id ?? null;

  // ── Live leaderboard: recalculates whenever prices update ─
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
      const [comps, allStocks] = await Promise.all([
        getUserCompetitions(userId),
        getAllStockPrices(),
      ]);
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

        // Batch-load all participants + their holdings for live leaderboard
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

  const handleTradeComplete = useCallback(() => {
    setRefreshKey(k => k + 1);
    setTimeout(loadAll, 500);
  }, [loadAll]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  const [copied, setCopied] = useState(false);
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
    setCenterTab("chart");
  }, []);

  const selectedHolding = selectedStock
    ? holdings.find(h => h.symbol === selectedStock.symbol) ?? null
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

  const spy = stocks.find(s => s.symbol === "SPY");

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
          <span style={{ fontWeight:600, fontSize:13, color:"rgba(232,234,240,0.9)" }} className="hidden sm:block">Tradecraft</span>
        </div>

        <div style={{ display:"flex", gap:4, flex:1, overflowX:"auto" }}>
          {competitions.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: "5px 13px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: activeIdx === i ? "1px solid rgba(125,211,176,0.35)" : "1px solid rgba(255,255,255,0.07)",
                background: activeIdx === i ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
                color: activeIdx === i ? "#7dd3b0" : "rgba(232,234,240,0.5)",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {c.competition?.name ?? "Competition"}
            </button>
          ))}
        </div>

        {competition?.mode === "friends" && competition?.invite_code && (
          <button
            onClick={handleCopyInvite}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "1px solid rgba(125,211,176,0.25)",
              background: copied ? "rgba(125,211,176,0.15)" : "rgba(125,211,176,0.06)",
              color: copied ? "#7dd3b0" : "rgba(125,211,176,0.7)",
              transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {copied ? "✓ Copied!" : "🔗 Invite friends"}
          </button>
        )}

        <button
          onClick={handleSignOut}
          style={{ fontSize:11, color:"rgba(232,234,240,0.4)", background:"none", border:"none", cursor:"pointer", flexShrink:0, marginLeft:4 }}
        >
          Sign out
        </button>
      </header>

      {/* ── Ticker bar ── */}
      {stocks.length > 0 && (
        <TickerBar stocks={stocks} onSelect={handleTickerSelect} />
      )}

      {/* ── Main 3-column layout ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Left: Portfolio */}
        <aside className="hidden lg:flex" style={{
          width: 280,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          overflowY: "auto",
          flexShrink: 0,
          flexDirection: "column",
        }}>
          {participant && (
            <Portfolio
              participant={participant}
              holdings={holdings}
              prices={stocks}
              startingCash={competition?.starting_cash ?? 10000}
              onSelectSymbol={(sym) => {
                setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                setCenterTab("chart");
              }}
            />
          )}
        </aside>

        {/* Center: tabs + content */}
        <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Tab bar */}
          <div style={{
            display: "flex",
            gap: 0,
            padding: "0 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            overflowX: "auto",
            background: "rgba(255,255,255,0.01)",
          }}>
            {CENTER_TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCenterTab(key)}
                style={{
                  padding: "11px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  whiteSpace: "nowrap",
                  color: centerTab === key ? "#7dd3b0" : "rgba(232,234,240,0.45)",
                  borderBottom: centerTab === key ? "2px solid #7dd3b0" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>

            {/* Chart — SPY overview when no stock selected */}
            {centerTab === "chart" && (
              selectedStock ? (
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
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, color:"rgba(232,234,240,0.4)", fontSize:13 }}>
                  Select a stock to view its chart
                </div>
              )
            )}

            {centerTab === "history" && participantId && (
              <div style={{ padding:12 }}>
                <TradeHistory participantId={participantId} />
              </div>
            )}

            {centerTab === "leaderboard" && competition && (
              <div style={{ padding:12 }}>
                <Leaderboard
                  entries={leaderboard}
                  currentUserId={userId}
                  startingCash={competition.starting_cash}
                  endDate={competition.end_date}
                  competitionId={competition.id}
                  onBotsChanged={loadAll}
                />
              </div>
            )}

            {centerTab === "news" && (
              <div style={{ padding:12 }}>
                <NewsPanel
                  symbol={selectedStock?.symbol ?? "SPY"}
                  companyName={selectedStock?.company_name ?? selectedStock?.symbol ?? "S&P 500"}
                />
              </div>
            )}

            {centerTab === "ai" && participant && (
              <div style={{ padding:12 }}>
                <AIAdvisor
                  participant={participant}
                  holdings={holdings}
                  stocks={stocks}
                  recentTrades={trades}
                  startingCash={competition?.starting_cash ?? 10000}
                  onSelectSymbol={(sym) => {
                    setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                    setCenterTab("chart");
                  }}
                />
              </div>
            )}

            {centerTab === "watchlist" && userId && (
              <div style={{ padding:12 }}>
                <Watchlist
                  userId={userId}
                  stocks={stocks}
                  onSelect={(stock) => {
                    setSelectedStock(stock);
                    setCenterTab("chart");
                  }}
                />
              </div>
            )}

            {centerTab === "limits" && participantId && (
              <div style={{ padding:12 }}>
                <LimitOrders
                  participantId={participantId}
                  refreshKey={refreshKey}
                  onOrderFilled={loadAll}
                />
              </div>
            )}

            {centerTab === "alerts" && userId && (
              <div style={{ padding:12 }}>
                <PriceAlerts
                  userId={userId}
                  stocks={stocks}
                  onSelectSymbol={(sym) => {
                    setSelectedStock(stocks.find(s => s.symbol === sym) ?? null);
                    setCenterTab("chart");
                  }}
                  refreshKey={refreshKey}
                />
              </div>
            )}

          </div>
        </main>

        {/* Right: Stock list + Trade panel */}
        <aside style={{
          width: 300,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          <div style={{ flex:1, overflowY:"auto" }}>
            <StockList
              stocks={stocks}
              selectedSymbol={selectedStock?.symbol ?? ""}
              onSelect={(stock) => {
                setSelectedStock(stock);
                setCenterTab("chart");
              }}
            />
          </div>
          {selectedStock && participant && (
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
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
    </div>
  );
}
