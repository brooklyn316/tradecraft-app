"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

const BOT_META: Record<string, { name: string; color: string; emoji: string; tagline: string }> = {
  index:    { name: "The Indexer", color: "#60a5fa", emoji: "🏦", tagline: "Slow. Steady. Deadly." },
  momentum: { name: "Surge",       color: "#f59e0b", emoji: "⚡", tagline: "Built for breakouts." },
  random:   { name: "Wildcard",    color: "#a78bfa", emoji: "🎲", tagline: "Chaos is a strategy." },
};

interface Participant {
  id: string;
  user_id: string | null;
  is_bot: boolean;
  bot_strategy: string | null;
  username: string;
  cash_balance: number;
  portfolio_value: number;
  total_value: number;
  return_pct: number;
  rank: number;
  isMe: boolean;
}

interface TradeRow {
  symbol: string;
  company_name: string | null;
  action: string;
  shares: number;
  price: number;
  total: number;
  executed_at: string;
}

interface ResultsData {
  competition: {
    id: string;
    name: string;
    mode: string;
    starting_cash: number;
    start_date: string;
    end_date: string;
    status: string;
  };
  me: Participant;
  standings: Participant[];
  trades: TradeRow[];
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  mostTraded: string | null;
  totalTraded: number;
}

// Animated counter
function Counter({ target, prefix = "", suffix = "", decimals = 0, color = "white", duration = 1400 }: {
  target: number; prefix?: string; suffix?: string; decimals?: number; color?: string; duration?: number;
}) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(target * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return (
    <span style={{ color }}>
      {prefix}{val.toFixed(decimals)}{suffix}
    </span>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const { competitionId } = useParams<{ competitionId: string }>();
  const supabase = getSupabaseClient();

  const [data,    setData]    = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/"); return; }

        // Competition
        const { data: comp } = await supabase
          .from("competitions")
          .select("*")
          .eq("id", competitionId)
          .single();
        if (!comp) throw new Error("Competition not found");

        // All participants
        const { data: rawParts } = await supabase
          .from("competition_participants")
          .select("id, user_id, is_bot, bot_strategy, cash_balance, profiles(username)")
          .eq("competition_id", competitionId);

        if (!rawParts?.length) throw new Error("No participants found");

        const partIds = rawParts.map((p: any) => p.id);

        // Holdings for portfolio valuation
        const { data: holdings } = await supabase
          .from("holdings")
          .select("participant_id, symbol, shares, avg_cost")
          .in("participant_id", partIds);

        // Stock prices
        const { data: prices } = await supabase.from("stock_prices").select("symbol, price");
        const priceMap: Record<string, number> = {};
        for (const p of (prices ?? [])) priceMap[p.symbol] = p.price;

        // Build portfolio values
        const portfolioMap: Record<string, number> = {};
        for (const h of (holdings ?? [])) {
          portfolioMap[h.participant_id] = (portfolioMap[h.participant_id] ?? 0)
            + h.shares * (priceMap[h.symbol] ?? h.avg_cost);
        }

        // My participant
        const myPart = rawParts.find((p: any) => p.user_id === user.id);
        if (!myPart) throw new Error("You are not in this competition");

        // Build standings
        const standings: Participant[] = (rawParts as any[]).map(p => {
          const portVal = portfolioMap[p.id] ?? 0;
          const total   = p.cash_balance + portVal;
          return {
            id:              p.id,
            user_id:         p.user_id,
            is_bot:          p.is_bot,
            bot_strategy:    p.bot_strategy,
            username:        p.is_bot
              ? (BOT_META[p.bot_strategy]?.name ?? "Bot")
              : ((p.profiles as any)?.username ?? "Player"),
            cash_balance:    p.cash_balance,
            portfolio_value: portVal,
            total_value:     total,
            return_pct:      ((total - comp.starting_cash) / comp.starting_cash) * 100,
            rank:            0,
            isMe:            p.id === myPart.id,
          };
        }).sort((a, b) => b.total_value - a.total_value);
        standings.forEach((s, i) => s.rank = i + 1);

        const me = standings.find(s => s.isMe)!;

        // My trades
        const { data: trades } = await supabase
          .from("trades")
          .select("symbol, company_name, action, shares, price, total, executed_at")
          .eq("participant_id", myPart.id)
          .order("executed_at", { ascending: true });

        const myTrades = (trades ?? []) as TradeRow[];

        // Per-symbol P&L from trades
        const symMap: Record<string, { bought: number; sold: number; count: number }> = {};
        for (const t of myTrades) {
          if (!symMap[t.symbol]) symMap[t.symbol] = { bought: 0, sold: 0, count: 0 };
          if (t.action === "buy")  symMap[t.symbol].bought += t.total;
          if (t.action === "sell") symMap[t.symbol].sold   += t.total;
          symMap[t.symbol].count++;
        }
        // Add current holdings value
        const myHoldings = (holdings ?? []).filter(h => h.participant_id === myPart.id);
        for (const h of myHoldings) {
          if (!symMap[h.symbol]) symMap[h.symbol] = { bought: 0, sold: 0, count: 0 };
          symMap[h.symbol].sold += h.shares * (priceMap[h.symbol] ?? h.avg_cost);
        }

        const symPnl = Object.entries(symMap)
          .map(([sym, d]) => ({ symbol: sym, pnl: d.sold - d.bought, count: d.count }))
          .sort((a, b) => b.pnl - a.pnl);

        const bestTrade  = symPnl[0]?.pnl > 0    ? { symbol: symPnl[0].symbol,  pnl: symPnl[0].pnl }  : null;
        const worstTrade = symPnl[symPnl.length - 1]?.pnl < 0
          ? { symbol: symPnl[symPnl.length - 1].symbol, pnl: symPnl[symPnl.length - 1].pnl }
          : null;
        const mostTraded = Object.entries(symMap).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;
        const totalTraded = myTrades.reduce((s, t) => s + t.total, 0);

        setData({ competition: comp, me, standings, trades: myTrades, bestTrade, worstTrade, mostTraded, totalTraded });

        // Delay the reveal animation slightly
        setTimeout(() => setRevealed(true), 300);
      } catch (err) {
        console.error(err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [competitionId]);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#080f1a", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:"3px solid #7dd3b0", borderTopColor:"transparent", borderRadius:"50%", animation:"_spin 0.8s linear infinite" }} />
      <div style={{ color:"rgba(232,234,240,0.55)", fontSize:14 }}>Loading results…</div>
      <style>{`@keyframes _spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight:"100vh", background:"#080f1a", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#f87171", fontSize:14 }}>{error ?? "Results not found"}</div>
    </div>
  );

  const { competition, me, standings, trades, bestTrade, worstTrade, mostTraded, totalTraded } = data;
  const won     = me.rank === 1;
  const medalMap: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const medal   = medalMap[me.rank] ?? `#${me.rank}`;
  const heroColor = won ? "#4ade80" : me.rank === 2 ? "#f59e0b" : "#f87171";

  const dur = (() => {
    const ms = new Date(competition.end_date).getTime() - new Date(competition.start_date).getTime();
    const days = Math.round(ms / 86_400_000);
    if (days >= 365) return `${Math.round(days / 365)}y`;
    if (days >= 30)  return `${Math.round(days / 30)}mo`;
    return `${days}d`;
  })();

  return (
    <div style={{ minHeight:"100vh", background:"#080f1a", color:"rgba(232,234,240,0.9)", fontFamily:"system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.5; }
        }
        .reveal { opacity:0; animation: fadeUp 0.6s ease forwards; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"0 28px", height:52,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"rgba(8,15,26,0.95)", position:"sticky", top:0, zIndex:50 }}>
        <button onClick={() => router.push("/dashboard")}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8,
            fontSize:12, fontWeight:600, cursor:"pointer",
            border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"rgba(232,234,240,0.6)" }}>
          ← Trading Floor
        </button>
        <div style={{ fontSize:12, color:"rgba(232,234,240,0.4)", fontFamily:"monospace" }}>
          {competition.name} · {dur} competition
        </div>
        <button onClick={() => router.push("/stats")}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8,
            fontSize:12, fontWeight:600, cursor:"pointer",
            border:"1px solid rgba(125,211,176,0.2)", background:"rgba(125,211,176,0.07)", color:"#7dd3b0" }}>
          📊 Full Stats
        </button>
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"40px 28px 80px" }}>

        {/* ── Hero ── */}
        <div className={revealed ? "reveal" : ""} style={{ textAlign:"center", marginBottom:48, animationDelay:"0s" }}>
          <div style={{ fontSize:64, marginBottom:12, lineHeight:1 }}>{medal}</div>
          <div style={{ fontSize: won ? 40 : 32, fontWeight:800, color:heroColor, letterSpacing:"-0.02em", marginBottom:8 }}>
            {won ? "You beat the algorithm!" : me.rank === 2 ? "So close." : `You finished #${me.rank}.`}
          </div>
          <div style={{ fontSize:56, fontWeight:800, fontFamily:"monospace", color:heroColor, lineHeight:1.1, marginBottom:6 }}>
            {revealed && (
              <Counter
                target={me.return_pct}
                prefix={me.return_pct >= 0 ? "+" : ""}
                suffix="%"
                decimals={2}
                color={heroColor}
                duration={1600}
              />
            )}
          </div>
          <div style={{ fontSize:15, color:"rgba(232,234,240,0.5)", fontFamily:"monospace" }}>
            ${me.total_value.toLocaleString("en-US", { maximumFractionDigits:0 })} final value
            &nbsp;·&nbsp;
            started with ${competition.starting_cash.toLocaleString()}
          </div>
        </div>

        {/* ── Main grid ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

          {/* Final standings */}
          <div className={revealed ? "reveal" : ""}
            style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:14, padding:"20px 22px", animationDelay:"0.15s" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
              letterSpacing:"0.1em", marginBottom:16 }}>Final Standings</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {standings.map(p => {
                const bot = p.bot_strategy ? BOT_META[p.bot_strategy] : null;
                const isPos = p.return_pct >= 0;
                return (
                  <div key={p.id} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10,
                    background: p.isMe ? "rgba(125,211,176,0.06)" : "rgba(255,255,255,0.02)",
                    border: p.isMe ? "1px solid rgba(125,211,176,0.2)" : "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <span style={{ fontSize:18, width:24, textAlign:"center", flexShrink:0 }}>
                      {medalMap[p.rank] ?? `#${p.rank}`}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {bot && <span style={{ fontSize:12 }}>{bot.emoji}</span>}
                        <span style={{ fontSize:13, fontWeight:700,
                          color: p.isMe ? "#7dd3b0" : (bot ? bot.color : "rgba(232,234,240,0.85)") }}>
                          {p.username}
                        </span>
                        {p.isMe && (
                          <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3,
                            background:"rgba(125,211,176,0.12)", color:"#7dd3b0", letterSpacing:"0.06em" }}>
                            YOU
                          </span>
                        )}
                      </div>
                      {bot && (
                        <div style={{ fontSize:10, color:"rgba(232,234,240,0.4)", marginTop:1 }}>{bot.tagline}</div>
                      )}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:"monospace",
                        color: isPos ? "#4ade80" : "#f87171" }}>
                        {isPos ? "+" : ""}{p.return_pct.toFixed(2)}%
                      </div>
                      <div style={{ fontSize:10, color:"rgba(232,234,240,0.4)", fontFamily:"monospace" }}>
                        ${p.total_value.toLocaleString("en-US", { maximumFractionDigits:0 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Your game stats */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* Key numbers */}
            <div className={revealed ? "reveal" : ""}
              style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:14, padding:"20px 22px", animationDelay:"0.25s" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
                letterSpacing:"0.1em", marginBottom:16 }}>Your Game</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[
                  { label:"Trades Made",   value: String(trades.length),                              color:"white" },
                  { label:"Volume Traded", value:`$${(totalTraded/1000).toFixed(1)}k`,               color:"white" },
                  { label:"Cash Remaining",value:`$${me.cash_balance.toLocaleString("en-US",{maximumFractionDigits:0})}`, color:"rgba(232,234,240,0.7)" },
                  { label:"Portfolio",     value:`$${me.portfolio_value.toLocaleString("en-US",{maximumFractionDigits:0})}`, color:"rgba(232,234,240,0.7)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background:"rgba(255,255,255,0.02)", borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:9, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
                      letterSpacing:"0.08em", marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:17, fontWeight:700, fontFamily:"monospace", color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best / worst trade */}
            <div className={revealed ? "reveal" : ""}
              style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:14, padding:"20px 22px", animationDelay:"0.35s" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
                letterSpacing:"0.1em", marginBottom:14 }}>Highlights</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

                {bestTrade && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 12px", borderRadius:9,
                    background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.15)" }}>
                    <div>
                      <div style={{ fontSize:9, color:"rgba(74,222,128,0.7)", fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.08em", marginBottom:3 }}>Best Trade</div>
                      <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:"rgba(232,234,240,0.9)" }}>
                        {bestTrade.symbol}
                      </div>
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:"monospace", color:"#4ade80" }}>
                      +${bestTrade.pnl.toFixed(2)}
                    </div>
                  </div>
                )}

                {worstTrade && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 12px", borderRadius:9,
                    background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)" }}>
                    <div>
                      <div style={{ fontSize:9, color:"rgba(248,113,113,0.7)", fontWeight:700, textTransform:"uppercase",
                        letterSpacing:"0.08em", marginBottom:3 }}>Biggest Loss</div>
                      <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:"rgba(232,234,240,0.9)" }}>
                        {worstTrade.symbol}
                      </div>
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:"monospace", color:"#f87171" }}>
                      -${Math.abs(worstTrade.pnl).toFixed(2)}
                    </div>
                  </div>
                )}

                {mostTraded && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 12px", borderRadius:9,
                    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize:9, color:"rgba(232,234,240,0.45)", fontWeight:700, textTransform:"uppercase",
                      letterSpacing:"0.08em" }}>Most Traded</div>
                    <div style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", color:"rgba(232,234,240,0.85)" }}>
                      {mostTraded}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* vs bots */}
            {standings.filter(s => s.is_bot).length > 0 && (
              <div className={revealed ? "reveal" : ""}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:14, padding:"20px 22px", animationDelay:"0.45s" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
                  letterSpacing:"0.1em", marginBottom:14 }}>vs The Bots</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {standings.filter(s => s.is_bot).map(bot => {
                    const meta = BOT_META[bot.bot_strategy ?? ""] ?? null;
                    const isBeat = me.total_value > bot.total_value;
                    const diff   = me.return_pct - bot.return_pct;
                    return (
                      <div key={bot.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"8px 10px", borderRadius:8,
                        background: isBeat ? "rgba(74,222,128,0.04)" : "rgba(248,113,113,0.04)",
                        border: `1px solid ${isBeat ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:14 }}>{meta?.emoji}</span>
                          <span style={{ fontSize:12, fontWeight:600, color: meta?.color }}>{meta?.name}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11, fontFamily:"monospace",
                            color: isBeat ? "#4ade80" : "#f87171", fontWeight:700 }}>
                            {isBeat ? "BEAT" : "LOST"} by {Math.abs(diff).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Recent trades ── */}
        {trades.length > 0 && (
          <div className={revealed ? "reveal" : ""}
            style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:14, padding:"20px 22px", marginBottom:16, animationDelay:"0.55s" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(232,234,240,0.4)", textTransform:"uppercase",
              letterSpacing:"0.1em", marginBottom:14 }}>
              Trade Log ({trades.length} trades)
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:220, overflowY:"auto" }}>
              {[...trades].reverse().slice(0, 20).map((t, i) => {
                const isBuy = t.action === "buy";
                const dt = new Date(t.executed_at);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                    padding:"6px 8px", borderRadius:6, background:"rgba(255,255,255,0.02)" }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, flexShrink:0,
                      background: isBuy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                      color: isBuy ? "#4ade80" : "#f87171" }}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                    <span style={{ fontSize:12, fontWeight:700, fontFamily:"monospace", color:"rgba(232,234,240,0.85)", width:50 }}>
                      {t.symbol}
                    </span>
                    <span style={{ fontSize:11, color:"rgba(232,234,240,0.5)", fontFamily:"monospace" }}>
                      {t.shares} × ${t.price.toFixed(2)}
                    </span>
                    <span style={{ fontSize:11, fontFamily:"monospace", color:"rgba(232,234,240,0.65)", marginLeft:"auto", flexShrink:0 }}>
                      ${t.total.toLocaleString("en-US", { maximumFractionDigits:0 })}
                    </span>
                    <span style={{ fontSize:10, color:"rgba(232,234,240,0.35)", fontFamily:"monospace", flexShrink:0, minWidth:80, textAlign:"right" }}>
                      {dt.toLocaleDateString("en-US", { month:"short", day:"numeric" })} {dt.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className={revealed ? "reveal" : ""}
          style={{ display:"flex", justifyContent:"center", gap:12, animationDelay:"0.65s" }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ padding:"12px 28px", borderRadius:11, fontSize:14, fontWeight:700, cursor:"pointer",
              background:"rgba(125,211,176,0.1)", border:"1px solid rgba(125,211,176,0.3)", color:"#7dd3b0" }}>
            ↩ Play Again
          </button>
          <button onClick={() => router.push("/stats")}
            style={{ padding:"12px 28px", borderRadius:11, fontSize:14, fontWeight:700, cursor:"pointer",
              background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(232,234,240,0.7)" }}>
            📊 Trading Record
          </button>
        </div>

      </div>
    </div>
  );
}
