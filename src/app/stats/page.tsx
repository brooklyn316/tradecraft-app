"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

// ── Sector map ───────────────────────────────────────────────
const SECTORS: Record<string, string> = {
  AAPL:"Tech", MSFT:"Tech", GOOGL:"Tech", GOOG:"Tech", META:"Tech",
  NVDA:"Tech", AMD:"Tech", TSLA:"Tech", INTC:"Tech", CRM:"Tech",
  ORCL:"Tech", ADBE:"Tech", UBER:"Tech", LYFT:"Tech",
  SNOW:"Tech", PLTR:"Tech", COIN:"Tech", SQ:"Tech", PYPL:"Tech",
  JPM:"Finance", BAC:"Finance", GS:"Finance", WFC:"Finance", MS:"Finance",
  C:"Finance", AXP:"Finance", BLK:"Finance", SCHW:"Finance",
  JNJ:"Healthcare", PFE:"Healthcare", UNH:"Healthcare", ABBV:"Healthcare",
  MRK:"Healthcare", LLY:"Healthcare", TMO:"Healthcare", ABT:"Healthcare",
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy",
  AMZN:"Consumer", WMT:"Consumer", COST:"Consumer", HD:"Consumer",
  TGT:"Consumer", NKE:"Consumer", SBUX:"Consumer", MCD:"Consumer",
  DIS:"Media", CMCSA:"Media", NFLX:"Media",
  BA:"Industrial", CAT:"Industrial", GE:"Industrial", HON:"Industrial",
  SPY:"Index", QQQ:"Index", DIA:"Index", IWM:"Index",
};

const BOT_META = {
  index:    { name: "The Indexer", color: "#60a5fa", emoji: "🏦" },
  momentum: { name: "Surge",       color: "#f59e0b", emoji: "⚡" },
  random:   { name: "Wildcard",    color: "#a78bfa", emoji: "🎲" },
};

// ── Types ────────────────────────────────────────────────────
interface GameRecord {
  competitionId: string;
  name: string;
  mode: string;
  startingCash: number;
  startDate: string;
  endDate: string;
  status: string;
  participantId: string;
  finalCash: number;
  portfolioValue: number;
  totalValue: number;
  returnPct: number;
  rank: number;
  totalParticipants: number;
  botStrategies: string[];
  won: boolean;
}

interface SymbolPnl {
  symbol: string;
  company: string;
  totalBought: number;
  totalSold: number;
  currentValue: number;
  netPnl: number;
  tradeCount: number;
}

interface TradeRow {
  id: string;
  symbol: string;
  company_name: string | null;
  action: string;
  shares: number;
  price: number;
  total: number;
  executed_at: string;
  participant_id: string;
}

interface StatsData {
  username: string;
  games: GameRecord[];
  allTrades: TradeRow[];
  symbolPnl: SymbolPnl[];
  totalPnl: number;
  winRate: number;
  bestReturn: number;
  worstReturn: number;
  totalTrades: number;
  botRecord: Record<string, { wins: number; losses: number }>;
  avgTradeSize: number;
  buyCount: number;
  sellCount: number;
  mostActiveHour: number;
  memberSince: string;
}

// ── Helper components ────────────────────────────────────────
function StatCard({ label, value, sub, color = "white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "20px 22px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.45)",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.45)", marginTop: 6, fontFamily: "monospace" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.5)",
        textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 11, color: "rgba(232,234,240,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PnlBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, fontFamily: "monospace",
      color: pos ? "#4ade80" : "#f87171",
    }}>
      {pos ? "+" : ""}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function PctBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 700, fontFamily: "monospace",
      padding: "2px 7px", borderRadius: 5,
      background: pos ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
      color: pos ? "#4ade80" : "#f87171",
      border: `1px solid ${pos ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
    }}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function StatsPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        // 1. Auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/"); return; }

        // 2. Profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, created_at")
          .eq("id", user.id)
          .single();

        // 3. User's participation records (with competition details)
        const { data: participations } = await supabase
          .from("competition_participants")
          .select("*, competition:competitions(*)")
          .eq("user_id", user.id)
          .eq("is_bot", false);

        if (!participations?.length) {
          setStats({
            username: profile?.username ?? "Trader",
            games: [], allTrades: [], symbolPnl: [],
            totalPnl: 0, winRate: 0, bestReturn: 0, worstReturn: 0,
            totalTrades: 0, botRecord: {}, avgTradeSize: 0,
            buyCount: 0, sellCount: 0, mostActiveHour: 9,
            memberSince: profile?.created_at ?? new Date().toISOString(),
          });
          setLoading(false);
          return;
        }

        const participantIds = participations.map(p => p.id);
        const competitionIds = participations.map(p => p.competition_id);

        // 4. All trades for user across all competitions
        const { data: allTrades } = await supabase
          .from("trades")
          .select("*")
          .in("participant_id", participantIds)
          .order("executed_at", { ascending: true });

        // 5. All participants in user's competitions (for ranking)
        const { data: allParticipants } = await supabase
          .from("competition_participants")
          .select("id, competition_id, user_id, is_bot, bot_strategy, cash_balance")
          .in("competition_id", competitionIds);

        // 6. All holdings for user's participants
        const { data: allHoldings } = await supabase
          .from("holdings")
          .select("participant_id, symbol, shares, avg_cost")
          .in("participant_id", participantIds);

        // 7. Current stock prices
        const { data: stockPrices } = await supabase
          .from("stock_prices")
          .select("symbol, price");
        const priceMap: Record<string, number> = {};
        for (const sp of (stockPrices ?? [])) priceMap[sp.symbol] = sp.price;

        // ── Compute holdings value per participant ──
        const holdingsValueMap: Record<string, number> = {};
        for (const h of (allHoldings ?? [])) {
          const val = h.shares * (priceMap[h.symbol] ?? h.avg_cost);
          holdingsValueMap[h.participant_id] = (holdingsValueMap[h.participant_id] ?? 0) + val;
        }

        // ── Build game records ──
        const games: GameRecord[] = [];
        const botRecord: Record<string, { wins: number; losses: number }> = {
          index: { wins: 0, losses: 0 },
          momentum: { wins: 0, losses: 0 },
          random: { wins: 0, losses: 0 },
        };

        for (const p of participations) {
          const comp = p.competition as {
            id: string; name: string; mode: string; starting_cash: number;
            start_date: string; end_date: string; status: string;
          };
          if (!comp) continue;

          const myPortfolioValue = holdingsValueMap[p.id] ?? 0;
          const myTotal = p.cash_balance + myPortfolioValue;
          const returnPct = ((myTotal - comp.starting_cash) / comp.starting_cash) * 100;

          // All participants in this competition
          const compParticipants = (allParticipants ?? []).filter(pp => pp.competition_id === comp.id);
          const botStrategies = compParticipants
            .filter(pp => pp.is_bot && pp.bot_strategy)
            .map(pp => pp.bot_strategy as string);

          // Rank everyone by total value
          const ranked = compParticipants.map(pp => ({
            ...pp,
            total: pp.cash_balance + (holdingsValueMap[pp.id] ?? 0),
          })).sort((a, b) => b.total - a.total);

          const myRank = ranked.findIndex(pp => pp.id === p.id) + 1;
          const won = myRank === 1;

          games.push({
            competitionId: comp.id,
            name: comp.name,
            mode: comp.mode,
            startingCash: comp.starting_cash,
            startDate: comp.start_date,
            endDate: comp.end_date,
            status: comp.status,
            participantId: p.id,
            finalCash: p.cash_balance,
            portfolioValue: myPortfolioValue,
            totalValue: myTotal,
            returnPct,
            rank: myRank,
            totalParticipants: compParticipants.length,
            botStrategies,
            won,
          });

          // Bot head-to-head
          for (const bot of compParticipants.filter(pp => pp.is_bot && pp.bot_strategy)) {
            const strat = bot.bot_strategy as string;
            if (botRecord[strat]) {
              const botTotal = bot.cash_balance + (holdingsValueMap[bot.id] ?? 0);
              if (myTotal > botTotal) botRecord[strat].wins++;
              else botRecord[strat].losses++;
            }
          }
        }

        // ── Per-symbol P&L ──
        const symbolMap: Record<string, {
          company: string;
          totalBought: number;
          totalSold: number;
          tradeCount: number;
        }> = {};

        for (const t of (allTrades ?? [])) {
          if (!symbolMap[t.symbol]) {
            symbolMap[t.symbol] = { company: t.company_name ?? t.symbol, totalBought: 0, totalSold: 0, tradeCount: 0 };
          }
          if (t.action === "buy")  symbolMap[t.symbol].totalBought += t.total;
          if (t.action === "sell") symbolMap[t.symbol].totalSold   += t.total;
          symbolMap[t.symbol].tradeCount++;
        }

        // Add current value of still-held shares
        const symbolCurrentValue: Record<string, number> = {};
        for (const h of (allHoldings ?? [])) {
          const key = h.symbol;
          symbolCurrentValue[key] = (symbolCurrentValue[key] ?? 0) + h.shares * (priceMap[h.symbol] ?? h.avg_cost);
        }

        const symbolPnl: SymbolPnl[] = Object.entries(symbolMap).map(([symbol, d]) => ({
          symbol,
          company: d.company,
          totalBought: d.totalBought,
          totalSold: d.totalSold,
          currentValue: symbolCurrentValue[symbol] ?? 0,
          netPnl: d.totalSold + (symbolCurrentValue[symbol] ?? 0) - d.totalBought,
          tradeCount: d.tradeCount,
        })).sort((a, b) => b.netPnl - a.netPnl);

        // ── Aggregate stats ──
        const totalPnl = games.reduce((s, g) => s + (g.totalValue - g.startingCash), 0);
        const winRate = games.length ? (games.filter(g => g.won).length / games.length) * 100 : 0;
        const returns = games.map(g => g.returnPct);
        const bestReturn = returns.length ? Math.max(...returns) : 0;
        const worstReturn = returns.length ? Math.min(...returns) : 0;
        const trades = allTrades ?? [];
        const buyCount  = trades.filter(t => t.action === "buy").length;
        const sellCount = trades.filter(t => t.action === "sell").length;
        const avgTradeSize = trades.length ? trades.reduce((s, t) => s + t.total, 0) / trades.length : 0;

        // Most active hour
        const hourCounts: Record<number, number> = {};
        for (const t of trades) {
          const h = new Date(t.executed_at).getHours();
          hourCounts[h] = (hourCounts[h] ?? 0) + 1;
        }
        const mostActiveHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
          ? parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
          : 9;

        setStats({
          username: profile?.username ?? "Trader",
          games: games.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
          allTrades: trades,
          symbolPnl,
          totalPnl,
          winRate,
          bestReturn,
          worstReturn,
          totalTrades: trades.length,
          botRecord,
          avgTradeSize,
          buyCount,
          sellCount,
          mostActiveHour,
          memberSince: profile?.created_at ?? new Date().toISOString(),
        });
      } catch (err) {
        console.error("Stats error:", err);
        setError("Failed to load stats.");
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#080f1a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #7dd3b0", borderTopColor: "transparent", borderRadius: "50%", animation: "_spin 0.8s linear infinite" }} />
        <div style={{ color: "rgba(232,234,240,0.55)", fontSize: 14 }}>Crunching your numbers…</div>
        <style>{`@keyframes _spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#080f1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#f87171", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const { games, symbolPnl, totalPnl, winRate, bestReturn, worstReturn,
    totalTrades, botRecord, avgTradeSize, buyCount, sellCount, mostActiveHour,
    username } = stats;

  const bestTrades  = symbolPnl.filter(s => s.netPnl > 0).slice(0, 5);
  const worstTrades = symbolPnl.filter(s => s.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl).slice(0, 5);
  const topStocks   = symbolPnl.slice(0, 8);

  // Sector breakdown
  const sectorPnl: Record<string, number> = {};
  for (const s of symbolPnl) {
    const sector = SECTORS[s.symbol] ?? "Other";
    sectorPnl[sector] = (sectorPnl[sector] ?? 0) + s.netPnl;
  }
  const sectors = Object.entries(sectorPnl).sort((a, b) => b[1] - a[1]);
  const maxSectorAbs = Math.max(...sectors.map(([, v]) => Math.abs(v)), 1);

  const hourLabel = (h: number) => {
    const suffix = h >= 12 ? "pm" : "am";
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display}${suffix}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080f1a", color: "rgba(232,234,240,0.9)", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 28px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#080f1a", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(232,234,240,0.6)" }}>
            ← Trading Floor
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>Trading Record</span>
            <span style={{ fontSize: 12, color: "rgba(232,234,240,0.45)", marginLeft: 10 }}>@{username}</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.35)", fontFamily: "monospace" }}>
          {games.length} competition{games.length !== 1 ? "s" : ""} · {totalTrades} trades
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 28px 60px" }}>

        {games.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "rgba(232,234,240,0.7)", marginBottom: 8 }}>No games yet</div>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.4)", marginBottom: 24 }}>Start a competition on the trading floor to see your stats here.</div>
            <button onClick={() => router.push("/dashboard")}
              style={{ padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: "rgba(125,211,176,0.1)", border: "1px solid rgba(125,211,176,0.25)", color: "#7dd3b0" }}>
              Go to Trading Floor →
            </button>
          </div>
        ) : (
          <>
            {/* ── Hero stat cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              <StatCard
                label="Games Played"
                value={String(games.length)}
                sub={`${games.filter(g => g.won).length} wins`}
              />
              <StatCard
                label="Win Rate"
                value={`${winRate.toFixed(0)}%`}
                sub={`${games.filter(g => g.won).length}W · ${games.filter(g => !g.won).length}L`}
                color={winRate >= 50 ? "#4ade80" : "#f87171"}
              />
              <StatCard
                label="Total P&L"
                value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                sub="across all games"
                color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
              />
              <StatCard
                label="Best Return"
                value={`${bestReturn >= 0 ? "+" : ""}${bestReturn.toFixed(1)}%`}
                sub={`Worst: ${worstReturn.toFixed(1)}%`}
                color={bestReturn >= 0 ? "#4ade80" : "#f87171"}
              />
            </div>

            {/* ── Second row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>

              {/* Bot head-to-head */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                <SectionHeader title="Bot Head-to-Head" sub="All time record" />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {Object.entries(BOT_META).map(([strat, meta]) => {
                    const rec = botRecord[strat] ?? { wins: 0, losses: 0 };
                    const total = rec.wins + rec.losses;
                    const winPct = total ? (rec.wins / total) * 100 : 0;
                    return (
                      <div key={strat}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{meta.name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#4ade80" }}>{rec.wins}W</span>
                            <span style={{ fontSize: 12, color: "rgba(232,234,240,0.3)" }}>·</span>
                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#f87171" }}>{rec.losses}L</span>
                          </div>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${winPct}%`, background: meta.color, borderRadius: 2, transition: "width 0.6s ease" }} />
                        </div>
                        {total === 0 && (
                          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.3)", marginTop: 4 }}>No games yet</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Best trades */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                <SectionHeader title="Best Performers" sub="Net P&L by stock" />
                {bestTrades.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(232,234,240,0.35)", fontStyle: "italic" }}>No profitable positions yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bestTrades.map((s, i) => (
                      <div key={s.symbol} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "rgba(232,234,240,0.3)", fontFamily: "monospace", width: 14 }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "rgba(232,234,240,0.85)" }}>{s.symbol}</span>
                            <PnlBadge value={s.netPnl} />
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 1 }}>
                            {s.tradeCount} trade{s.tradeCount !== 1 ? "s" : ""} · {SECTORS[s.symbol] ?? "Other"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Worst trades */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                <SectionHeader title="Worst Performers" sub="Net P&L by stock" />
                {worstTrades.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(232,234,240,0.35)", fontStyle: "italic" }}>No losing positions yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {worstTrades.map((s, i) => (
                      <div key={s.symbol} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "rgba(232,234,240,0.3)", fontFamily: "monospace", width: 14 }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "rgba(232,234,240,0.85)" }}>{s.symbol}</span>
                            <PnlBadge value={s.netPnl} />
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 1 }}>
                            {s.tradeCount} trade{s.tradeCount !== 1 ? "s" : ""} · {SECTORS[s.symbol] ?? "Other"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Third row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 24 }}>

              {/* Sector breakdown */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                <SectionHeader title="Sector Breakdown" sub="Net P&L by market sector" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sectors.map(([sector, pnl]) => {
                    const pos = pnl >= 0;
                    const barPct = (Math.abs(pnl) / maxSectorAbs) * 100;
                    return (
                      <div key={sector}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(232,234,240,0.75)" }}>{sector}</span>
                          <PnlBadge value={pnl} />
                        </div>
                        <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${barPct}%`, borderRadius: 3, transition: "width 0.6s ease",
                            background: pos ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                  {sectors.length === 0 && (
                    <div style={{ fontSize: 12, color: "rgba(232,234,240,0.35)", fontStyle: "italic" }}>No trades yet</div>
                  )}
                </div>
              </div>

              {/* Trading style */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                <SectionHeader title="Trading Style" sub="Patterns from your history" />
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  <div>
                    <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      Buy / Sell Split
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: buyCount, height: 8, background: "rgba(74,222,128,0.4)", borderRadius: "4px 0 0 4px", minWidth: 4 }} />
                      <div style={{ flex: sellCount, height: 8, background: "rgba(248,113,113,0.4)", borderRadius: "0 4px 4px 0", minWidth: 4 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace" }}>{buyCount} buys</span>
                      <span style={{ fontSize: 10, color: "#f87171", fontFamily: "monospace" }}>{sellCount} sells</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Avg Trade</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "white" }}>
                        ${avgTradeSize.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Peak Hour</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "white" }}>
                        {hourLabel(mostActiveHour)}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Most Traded Stock</div>
                    {topStocks[0] ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "white" }}>{topStocks[0].symbol}</span>
                          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", marginTop: 2 }}>{topStocks[0].tradeCount} trades</div>
                        </div>
                        <PnlBadge value={topStocks[0].netPnl} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(232,234,240,0.35)" }}>—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Recent games ── */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
              <SectionHeader title="Game History" sub="All competitions you've entered" />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Competition", "Mode", "Opponents", "Starting Cash", "Final Value", "Return", "Rank", "Result"].map(h => (
                        <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontSize: 9,
                          fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase",
                          letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g, i) => (
                      <tr key={g.competitionId}
                        style={{ borderBottom: i < games.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          background: g.won ? "rgba(74,222,128,0.02)" : "transparent" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(232,234,240,0.85)" }}>{g.name}</div>
                          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.35)", fontFamily: "monospace", marginTop: 2 }}>
                            {new Date(g.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                            background: "rgba(125,211,176,0.08)", color: "#7dd3b0", textTransform: "capitalize" }}>
                            {g.mode}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {g.botStrategies.length > 0
                              ? g.botStrategies.map(s => {
                                  const m = BOT_META[s as keyof typeof BOT_META];
                                  return m ? (
                                    <span key={s} style={{ fontSize: 10, color: m.color }}>{m.emoji} {m.name}</span>
                                  ) : null;
                                })
                              : <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>Friends</span>
                            }
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.6)" }}>
                          ${g.startingCash.toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.85)" }}>
                          ${g.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <PctBadge value={g.returnPct} />
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 13, fontFamily: "monospace",
                          color: g.rank === 1 ? "#f59e0b" : "rgba(232,234,240,0.6)", fontWeight: g.rank === 1 ? 700 : 400 }}>
                          {g.rank === 1 ? "🥇" : `#${g.rank}`} / {g.totalParticipants}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                            background: g.won ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${g.won ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.08)"}`,
                            color: g.won ? "#4ade80" : "rgba(232,234,240,0.5)" }}>
                            {g.won ? "WON" : g.status === "active" ? "Live" : "Finished"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
