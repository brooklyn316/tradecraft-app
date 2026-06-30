"use client";

import { useEffect, useState, useRef } from "react";
import type { StockPrice, Holding } from "@/types";

interface MarketSignalsProps {
  stocks: StockPrice[];
  holdings: Holding[];
  cashBalance: number;
  onSelectSymbol: (symbol: string) => void;
}

interface BuySignal {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  reason: string;
}

interface SellSignal {
  symbol: string;
  companyName: string;
  currentPrice: number;
  avgCost: number;
  shares: number;
  gainPercent: number;
  gainDollars: number;
  changeToday: number;
  recommendation: "TAKE PROFIT" | "CUT LOSS" | "WATCH";
}

export default function MarketSignals({
  stocks,
  holdings,
  cashBalance,
  onSelectSymbol,
}: MarketSignalsProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 60s (stocks prop is already live from parent polling)
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setLastUpdated(new Date());
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Compute signals whenever stocks/holdings change
  const heldSymbols = new Set(holdings.map(h => h.symbol));

  // ── BUY SIGNALS: top gainers the user doesn't own ──────────────────
  const buySignals: BuySignal[] = stocks
    .filter(s => !heldSymbols.has(s.symbol) && (s.change_percent ?? 0) > 1.5 && s.price > 0)
    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0))
    .slice(0, 5)
    .map(s => {
      const chg = s.change_percent ?? 0;
      const reason =
        chg >= 5 ? "Strong momentum today" :
        chg >= 3 ? "Solid daily gainer" :
        "Positive trend today";
      return {
        symbol: s.symbol,
        companyName: s.company_name ?? s.symbol,
        price: s.price,
        changePercent: chg,
        reason,
      };
    });

  // Also add big losers as contrarian buys if user has cash
  const bigLosers: BuySignal[] = cashBalance > 500
    ? stocks
        .filter(s => !heldSymbols.has(s.symbol) && (s.change_percent ?? 0) < -4 && s.price > 0)
        .sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0))
        .slice(0, 2)
        .map(s => ({
          symbol: s.symbol,
          companyName: s.company_name ?? s.symbol,
          price: s.price,
          changePercent: s.change_percent ?? 0,
          reason: "Deep dip — contrarian opportunity",
        }))
    : [];

  // ── SELL SIGNALS: owned stocks with notable P&L ─────────────────────
  const sellSignals: SellSignal[] = holdings
    .map(h => {
      const stock = stocks.find(s => s.symbol === h.symbol);
      if (!stock) return null;
      const gainPercent = ((stock.price - h.avg_cost) / h.avg_cost) * 100;
      const gainDollars = (stock.price - h.avg_cost) * h.shares;
      const changeToday = stock.change_percent ?? 0;
      const recommendation: SellSignal["recommendation"] =
        gainPercent >= 8  ? "TAKE PROFIT" :
        gainPercent <= -5 ? "CUT LOSS"    :
        "WATCH";
      return {
        symbol: h.symbol,
        companyName: stock.company_name ?? h.symbol,
        currentPrice: stock.price,
        avgCost: h.avg_cost,
        shares: h.shares,
        gainPercent,
        gainDollars,
        changeToday,
        recommendation,
      };
    })
    .filter((s): s is SellSignal => s !== null)
    .sort((a, b) => Math.abs(b.gainPercent) - Math.abs(a.gainPercent));

  const hasBuys = buySignals.length > 0 || bigLosers.length > 0;
  const hasSells = sellSignals.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{
        padding: "12px 14px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.9)" }}>
            Market Signals
          </div>
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 2 }}>
            Auto-refreshes · updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{
          fontSize: 9,
          fontFamily: "monospace",
          color: "rgba(232,234,240,0.35)",
          background: "rgba(255,255,255,0.04)",
          padding: "3px 7px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {countdown}s
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── SELL SIGNALS first (more urgent) ── */}
        {hasSells && (
          <div style={{ padding: "12px 12px 4px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Your positions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sellSignals.map(s => {
                const isProfit = s.gainPercent >= 0;
                const recColor =
                  s.recommendation === "TAKE PROFIT" ? "#4ade80" :
                  s.recommendation === "CUT LOSS"    ? "#f87171" :
                  "#60a5fa";
                const recBg =
                  s.recommendation === "TAKE PROFIT" ? "rgba(74,222,128,0.08)" :
                  s.recommendation === "CUT LOSS"    ? "rgba(248,113,113,0.08)" :
                  "rgba(96,165,250,0.08)";
                return (
                  <div key={s.symbol} style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}>
                    {/* Top row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(232,234,240,0.9)" }}>{s.symbol}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                          background: recBg, color: recColor,
                          border: `1px solid ${recColor}30`,
                          letterSpacing: "0.04em",
                        }}>
                          {s.recommendation}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.6)", fontWeight: 600 }}>
                        ${s.currentPrice.toFixed(2)}
                      </div>
                    </div>

                    {/* P&L row */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(232,234,240,0.38)", marginBottom: 2 }}>Bought at</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.6)" }}>
                          ${s.avgCost.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(232,234,240,0.38)", marginBottom: 2 }}>P&amp;L</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: isProfit ? "#4ade80" : "#f87171" }}>
                          {isProfit ? "+" : ""}{s.gainPercent.toFixed(1)}%
                          <span style={{ fontSize: 9, fontWeight: 400, color: "rgba(232,234,240,0.45)", marginLeft: 4 }}>
                            ({isProfit ? "+" : ""}${s.gainDollars.toFixed(0)})
                          </span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(232,234,240,0.38)", marginBottom: 2 }}>Today</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: s.changeToday >= 0 ? "#4ade80" : "#f87171" }}>
                          {s.changeToday >= 0 ? "+" : ""}{s.changeToday.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(232,234,240,0.38)", marginBottom: 2 }}>Shares</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.5)" }}>
                          {s.shares}
                        </div>
                      </div>
                    </div>

                    {/* Trade button */}
                    <button
                      onClick={() => onSelectSymbol(s.symbol)}
                      style={{
                        width: "100%",
                        padding: "6px 0",
                        borderRadius: 7,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: recBg,
                        border: `1px solid ${recColor}30`,
                        color: recColor,
                        letterSpacing: "0.02em",
                      }}
                    >
                      Trade {s.symbol} →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BUY SIGNALS ── */}
        {hasBuys && (
          <div style={{ padding: "12px 12px 4px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Buy opportunities
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...buySignals, ...bigLosers].map(s => {
                const isUp = s.changePercent >= 0;
                const isContrarian = s.changePercent < 0;
                return (
                  <div key={s.symbol} style={{
                    background: isContrarian ? "rgba(248,113,113,0.04)" : "rgba(74,222,128,0.04)",
                    border: `1px solid ${isContrarian ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)"}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(232,234,240,0.9)" }}>{s.symbol}</span>
                        <span style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 5,
                          background: isContrarian ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
                          color: isContrarian ? "#f87171" : "#4ade80",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                        }}>
                          {isContrarian ? "DIP BUY" : "BUY"}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: isUp ? "#4ade80" : "#f87171" }}>
                          {isUp ? "+" : ""}{s.changePercent.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.5)" }}>
                          ${s.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.companyName} · {s.reason}
                    </div>
                    <button
                      onClick={() => onSelectSymbol(s.symbol)}
                      style={{
                        width: "100%",
                        padding: "6px 0",
                        borderRadius: 7,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: isContrarian ? "rgba(248,113,113,0.08)" : "rgba(74,222,128,0.08)",
                        border: `1px solid ${isContrarian ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)"}`,
                        color: isContrarian ? "#f87171" : "#4ade80",
                      }}
                    >
                      View &amp; Buy →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasBuys && !hasSells && (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(232,234,240,0.5)", marginBottom: 6 }}>
              No signals yet
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", lineHeight: 1.6 }}>
              Signals appear during market hours when stocks move significantly or your positions hit notable P&amp;L thresholds.
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "8px 12px 12px" }}>
          <p style={{ fontSize: 9, color: "rgba(232,234,240,0.3)", margin: 0, lineHeight: 1.5 }}>
            Signals are rule-based triggers — not financial advice. BUY shows stocks up &gt;1.5% you don&apos;t own. SELL thresholds: Take Profit ≥8% gain, Cut Loss ≤−5%.
          </p>
        </div>

      </div>
    </div>
  );
}
