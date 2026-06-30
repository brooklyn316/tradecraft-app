"use client";

import { useCallback, useEffect, useState } from "react";

interface TradeSummary {
  totalTrades:       number;
  totalBuys:         number;
  totalSells:        number;
  totalVolume:       number;
  avgTradeSize:      number;
  realizedPnL:       number;
  unrealizedPnL:     number;
  winningSymbols:    number;
  losingSymbols:     number;
  symbolCount:       number;
  bestTrade:         { symbol: string; pnl: number; executed_at: string } | null;
  worstTrade:        { symbol: string; pnl: number; executed_at: string } | null;
  mostTradedSymbol:  string | null;
}

interface SymbolEntry {
  symbol:        string;
  tradeCount:    number;
  totalBought:   number;
  totalSold:     number;
  realizedPnL:   number;
  unrealizedPnL: number;
  sharesHeld:    number;
  avgCost:       number;
  currentPrice:  number;
}

interface TradeEntry {
  id:                string;
  symbol:            string;
  action:            "buy" | "sell";
  shares:            number;
  price:             number;
  total:             number;
  executed_at:       string;
  tradeRealizedPnL?: number;
}

interface JournalData {
  summary:  TradeSummary | null;
  bySymbol: SymbolEntry[];
  trades:   TradeEntry[];
}

interface TradeJournalProps {
  participantId: string;
  competitionEnded?: boolean;
}

type ViewTab = "overview" | "symbols" | "timeline";

function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtSmall(n: number) {
  return Math.abs(n) >= 1000
    ? `${n >= 0 ? "+" : "-"}$${(Math.abs(n) / 1000).toFixed(1)}k`
    : `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(0)}`;
}

function pnlColor(n: number) {
  if (n > 0) return "#4ade80";
  if (n < 0) return "#f87171";
  return "rgba(232,234,240,0.5)";
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TradeJournal({ participantId, competitionEnded = false }: TradeJournalProps) {
  const [data,    setData]    = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<ViewTab>("overview");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trade-journal?participantId=${participantId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    load();
    if (!competitionEnded) {
      const t = setInterval(load, 60_000);
      return () => clearInterval(t);
    }
  }, [load, competitionEnded]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        Loading journal…
      </div>
    );
  }

  if (!data || !data.summary || data.trades.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📓</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(232,234,240,0.55)" }}>No trades yet</div>
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", marginTop: 4 }}>
          Your trade journal will appear here once you start trading.
        </div>
      </div>
    );
  }

  const { summary, bySymbol, trades } = data;
  const totalPnL = summary.realizedPnL + summary.unrealizedPnL;
  const winRate = summary.symbolCount > 0
    ? Math.round((summary.winningSymbols / summary.symbolCount) * 100)
    : 0;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 4px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: active ? "#7dd3b0" : "rgba(232,234,240,0.4)",
    borderBottom: active ? "2px solid #7dd3b0" : "2px solid transparent",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    transition: "all 0.15s",
  });

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: "12px 14px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>
            📓 Trade Journal
          </div>
          <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 2 }}>
            {competitionEnded ? "Post-game analysis" : "Live tracking"}
          </div>
        </div>
        <div style={{
          fontSize: 16, fontWeight: 900, fontFamily: "monospace",
          color: pnlColor(totalPnL),
        }}>
          {fmtSmall(totalPnL)}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.01)",
      }}>
        <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button style={tabStyle(tab === "symbols")} onClick={() => setTab("symbols")}>By Symbol</button>
        <button style={tabStyle(tab === "timeline")} onClick={() => setTab("timeline")}>Timeline</button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div style={{ padding: "12px 14px" }}>

          {/* P&L cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${totalPnL >= 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              borderRadius: 10, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Total P&L
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: pnlColor(totalPnL) }}>
                {totalPnL >= 0 ? "+" : ""}{fmt(totalPnL, 0)}
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Win Rate
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: winRate >= 50 ? "#4ade80" : "#f87171" }}>
                {winRate}%
              </div>
            </div>
          </div>

          {/* Realized vs Unrealized */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, padding: "10px 14px",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>Realized P&L</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: pnlColor(summary.realizedPnL) }}>
                {summary.realizedPnL >= 0 ? "+" : ""}{fmt(summary.realizedPnL, 0)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>Unrealized P&L</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: pnlColor(summary.unrealizedPnL) }}>
                {summary.unrealizedPnL >= 0 ? "+" : ""}{fmt(summary.unrealizedPnL, 0)}
              </span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>Volume traded</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "rgba(232,234,240,0.7)" }}>
                {fmt(summary.totalVolume, 0)}
              </span>
            </div>
          </div>

          {/* Stats grid */}
          {[
            ["Trades",         summary.totalTrades,      null],
            ["Buys",           summary.totalBuys,        null],
            ["Sells",          summary.totalSells,       null],
            ["Stocks traded",  summary.symbolCount,      null],
            ["Winning stocks", summary.winningSymbols,   null],
            ["Losing stocks",  summary.losingSymbols,    null],
            ["Avg trade size", fmt(summary.avgTradeSize, 0), null],
            ["Most traded",    summary.mostTradedSymbol ?? "—", null],
          ].map(([label, value]) => (
            <div key={label as string} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "rgba(232,234,240,0.8)" }}>{value}</span>
            </div>
          ))}

          {/* Best / Worst trade */}
          {(summary.bestTrade || summary.worstTrade) && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {summary.bestTrade && (
                <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Best trade</div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>{summary.bestTrade.symbol}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80" }}>+{fmt(summary.bestTrade.pnl, 0)}</div>
                </div>
              )}
              {summary.worstTrade && (
                <div style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Worst trade</div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>{summary.worstTrade.symbol}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171" }}>{fmt(summary.worstTrade.pnl, 0)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BY SYMBOL ── */}
      {tab === "symbols" && (
        <div>
          {bySymbol.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>No data</div>
          ) : bySymbol.map(s => {
            const totalPnL = s.realizedPnL + s.unrealizedPnL;
            return (
              <div key={s.symbol} style={{
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: "rgba(232,234,240,0.9)" }}>
                    {s.symbol}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: pnlColor(totalPnL) }}>
                    {totalPnL >= 0 ? "+" : ""}{fmt(totalPnL, 0)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(232,234,240,0.45)" }}>
                  <span>{s.tradeCount} trades</span>
                  {s.sharesHeld > 0 && <span>Holding {s.sharesHeld} sh @ {fmt(s.avgCost)}</span>}
                  {s.realizedPnL !== 0 && (
                    <span style={{ color: pnlColor(s.realizedPnL) }}>
                      Realized {s.realizedPnL >= 0 ? "+" : ""}{fmt(s.realizedPnL, 0)}
                    </span>
                  )}
                </div>
                {/* Mini bar */}
                {(s.totalBought > 0 || s.totalSold > 0) && (
                  <div style={{ marginTop: 6, display: "flex", gap: 3, height: 3 }}>
                    <div style={{
                      flex: s.totalBought,
                      background: "rgba(248,113,113,0.5)",
                      borderRadius: 2,
                    }} />
                    <div style={{
                      flex: s.totalSold,
                      background: "rgba(74,222,128,0.5)",
                      borderRadius: 2,
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TIMELINE ── */}
      {tab === "timeline" && (
        <div>
          {[...trades].reverse().map((t, i) => {
            const isBuy = t.action === "buy";
            return (
              <div key={t.id ?? i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "8px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                {/* Timeline dot */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: isBuy ? "#4ade80" : "#f87171",
                    flexShrink: 0,
                  }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                        color: isBuy ? "#4ade80" : "#f87171",
                      }}>
                        {isBuy ? "BUY" : "SELL"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>{t.symbol}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: isBuy ? "#f87171" : "#4ade80" }}>
                      {isBuy ? "−" : "+"}{fmt(t.total, 0)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", fontFamily: "monospace" }}>
                      {t.shares} sh @ {fmt(t.price)}
                    </span>
                    <span style={{ fontSize: 9, color: "rgba(232,234,240,0.35)" }}>
                      {timeAgo(t.executed_at)}
                    </span>
                  </div>
                  {/* Realized P&L annotation on sells */}
                  {!isBuy && t.tradeRealizedPnL !== undefined && (
                    <div style={{
                      marginTop: 4, fontSize: 9, fontWeight: 700,
                      color: pnlColor(t.tradeRealizedPnL),
                      display: "inline-block",
                      background: t.tradeRealizedPnL >= 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                      border: `1px solid ${t.tradeRealizedPnL >= 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                      padding: "1px 6px", borderRadius: 4,
                    }}>
                      {t.tradeRealizedPnL >= 0 ? "+" : ""}{fmt(t.tradeRealizedPnL, 0)} realized
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
