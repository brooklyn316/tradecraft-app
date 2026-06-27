"use client";

import { useEffect, useState } from "react";
import { getRecentTrades, formatCurrency } from "@/lib/stockApi";

interface Trade {
  id?: string;
  symbol: string;
  company_name: string;
  action: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  executed_at: string;
}

interface TradeHistoryProps {
  participantId: string;
  refreshKey?: number;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TradeHistory({ participantId, refreshKey }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getRecentTrades(participantId, 100)
      .then(data => { setTrades(data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [participantId, refreshKey]);

  const buys = trades.filter(t => t.action === "buy");
  const sells = trades.filter(t => t.action === "sell");
  const totalSpent = buys.reduce((s, t) => s + t.total, 0);
  const totalReceived = sells.reduce((s, t) => s + t.total, 0);

  // Group by symbol to find most-traded
  const symbolCounts = trades.reduce<Record<string, number>>((acc, t) => {
    acc[t.symbol] = (acc[t.symbol] ?? 0) + 1;
    return acc;
  }, {});
  const topSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Summary cards */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          Trade Summary
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Total Bought</div>
            <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, color: "#4ade80" }}>{formatCurrency(totalSpent)}</div>
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.52)", marginTop: 1 }}>{buys.length} trade{buys.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.12)", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Total Sold</div>
            <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, color: "#f87171" }}>{formatCurrency(totalReceived)}</div>
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.52)", marginTop: 1 }}>{sells.length} trade{sells.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {topSymbol && (
          <div style={{ background: "rgba(125,211,176,0.05)", border: "1px solid rgba(125,211,176,0.1)", borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Most traded</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7dd3b0", marginTop: 2 }}>{topSymbol[0]}</div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.52)" }}>{topSymbol[1]} trade{topSymbol[1] !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>

      {/* Trade list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>
          History ({trades.length})
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "rgba(232,234,240,0.52)" }}>Loading...</div>
        ) : trades.length === 0 ? (
          <div style={{ padding: "48px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(232,234,240,0.65)", fontWeight: 500 }}>No trades yet</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.65)", marginTop: 4 }}>Your trade history will appear here</div>
            </div>
          </div>
        ) : (
          trades.map((trade, i) => {
            const isBuy = trade.action === "buy";
            return (
              <div key={trade.id ?? i} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>

                {/* Action badge */}
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                  background: isBuy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                  color: isBuy ? "#4ade80" : "#f87171",
                  border: `1px solid ${isBuy ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                }}>
                  {isBuy ? "BUY" : "SELL"}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.9)" }}>{trade.symbol}</span>
                    <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: isBuy ? "#f87171" : "#4ade80" }}>
                      {isBuy ? "−" : "+"}{formatCurrency(trade.total)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "rgba(232,234,240,0.52)", fontFamily: "monospace" }}>
                      {trade.shares} sh × ${trade.price.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(232,234,240,0.65)" }}>
                      {formatRelativeTime(trade.executed_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
