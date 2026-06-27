"use client";

import { useEffect, useRef, useState } from "react";
import type { Holding, StockPrice, CompetitionParticipant } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/stockApi";

interface PortfolioProps {
  participant: CompetitionParticipant;
  holdings: Holding[];
  prices: StockPrice[];
  startingCash: number;
  onSelectSymbol: (symbol: string) => void;
}

// Smooth animated number that eases to its new value
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (Math.abs(from - to) < 0.01) { setDisplay(to); return; }

    const duration = 700;
    const startTime = performance.now();

    function tick(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span>{format(display)}</span>;
}

export default function Portfolio({ participant, holdings, prices, startingCash, onSelectSymbol }: PortfolioProps) {
  const priceMap = Object.fromEntries(prices.map((p) => [p.symbol, p]));

  const enrichedHoldings = holdings.map((h) => {
    const price = priceMap[h.symbol]?.price ?? h.avg_cost;
    const marketValue = h.shares * price;
    const costBasis = h.shares * h.avg_cost;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { ...h, price, marketValue, pnl, pnlPercent };
  });

  const holdingsValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalValue = participant.cash_balance + holdingsValue;
  const totalReturn = totalValue - startingCash;
  const totalReturnPct = (totalReturn / startingCash) * 100;
  const isPositive = totalReturn >= 0;
  const cashPct = totalValue > 0 ? (participant.cash_balance / totalValue) * 100 : 100;

  // Analytics
  const winning = enrichedHoldings.filter(h => h.pnl > 0);
  const losing = enrichedHoldings.filter(h => h.pnl < 0);
  const winRate = enrichedHoldings.length > 0 ? (winning.length / enrichedHoldings.length) * 100 : 0;
  const bestHolder = enrichedHoldings.length > 0
    ? enrichedHoldings.reduce((best, h) => h.pnlPercent > best.pnlPercent ? h : best, enrichedHoldings[0])
    : null;
  const worstHolder = enrichedHoldings.length > 0
    ? enrichedHoldings.reduce((worst, h) => h.pnlPercent < worst.pnlPercent ? h : worst, enrichedHoldings[0])
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Hero: Portfolio Value ── */}
      <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          Portfolio Value
        </div>
        <div style={{ fontSize: 28, fontFamily: "monospace", fontWeight: 800, color: "white", lineHeight: 1.1, marginBottom: 4 }}>
          <AnimatedNumber value={totalValue} format={formatCurrency} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "monospace", fontWeight: 600, color: isPositive ? "#4ade80" : "#f87171" }}>
          <span>{isPositive ? "▲" : "▼"}</span>
          <AnimatedNumber value={Math.abs(totalReturn)} format={formatCurrency} />
          <span style={{ color: "rgba(232,234,240,0.45)" }}>·</span>
          <AnimatedNumber value={totalReturnPct} format={v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`} />
        </div>

        {/* Cash / Stocks bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(232,234,240,0.45)", marginBottom: 5, fontFamily: "monospace" }}>
            <span>Cash {cashPct.toFixed(0)}%</span>
            <span>Stocks {(100 - cashPct).toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#60a5fa,#7dd3b0)", transition: "width 0.5s ease", width: `${cashPct}%` }} />
            <div style={{ height: "100%", background: "linear-gradient(90deg,#4ade80,#22d3ee)", transition: "width 0.5s ease", width: `${100 - cashPct}%` }} />
          </div>
        </div>

        {/* Cash pill */}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#60a5fa" }} />
            <span style={{ fontSize: 11, color: "rgba(232,234,240,0.45)" }}>Cash available</span>
          </div>
          <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "white" }}>{formatCurrency(participant.cash_balance)}</span>
        </div>
      </div>

      {/* ── Analytics block ── */}
      {enrichedHoldings.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Performance Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>

            {/* Win rate */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 8px" }}>
              <div style={{ fontSize: 8, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Win Rate</div>
              <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: winRate >= 50 ? "#4ade80" : "#f87171" }}>
                {winRate.toFixed(0)}%
              </div>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.5)", marginTop: 1 }}>{winning.length}W · {losing.length}L</div>
            </div>

            {/* Best performer */}
            {bestHolder && (
              <div style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 8, padding: "7px 8px" }}>
                <div style={{ fontSize: 8, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Best</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#4ade80" }}>{bestHolder.symbol}</div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#4ade80", marginTop: 1 }}>+{bestHolder.pnlPercent.toFixed(1)}%</div>
              </div>
            )}

            {/* Worst performer */}
            {worstHolder && worstHolder.pnl < 0 && (
              <div style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.12)", borderRadius: 8, padding: "7px 8px" }}>
                <div style={{ fontSize: 8, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Worst</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>{worstHolder.symbol}</div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#f87171", marginTop: 1 }}>{worstHolder.pnlPercent.toFixed(1)}%</div>
              </div>
            )}
            {(!worstHolder || worstHolder.pnl >= 0) && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 8px" }}>
                <div style={{ fontSize: 8, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Positions</div>
                <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>
                  {enrichedHoldings.length}
                </div>
                <div style={{ fontSize: 9, color: "rgba(232,234,240,0.5)", marginTop: 1 }}>all in profit</div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Holdings list ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "8px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Holdings</span>
          <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)" }}>{enrichedHoldings.length} position{enrichedHoldings.length !== 1 ? "s" : ""}</span>
        </div>

        {enrichedHoldings.length === 0 ? (
          <div style={{ padding: "40px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(232,234,240,0.45)", fontWeight: 500 }}>No positions yet</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.45)", marginTop: 4 }}>Buy your first stock to get started</div>
            </div>
          </div>
        ) : (
          enrichedHoldings
            .sort((a, b) => b.marketValue - a.marketValue)
            .map((h) => {
              const allocationPct = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
              return (
                <button key={h.symbol} onClick={() => onSelectSymbol(h.symbol)}
                  style={{ width: "100%", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "block" }}>
                  {/* Top row: symbol + P&L badge + market value */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.9)" }}>{h.symbol}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                          background: h.pnl >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                          color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                          {h.pnl >= 0 ? "+" : ""}{h.pnlPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", marginTop: 2 }}>
                        {h.shares.toFixed(0)} shares
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.9)" }}>{formatCurrency(h.marketValue)}</div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", marginTop: 2, color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                        {h.pnl >= 0 ? "+" : ""}{formatCurrency(h.pnl)}
                      </div>
                    </div>
                  </div>

                  {/* Price comparison row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
                    padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.025)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 8, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Bought</div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "rgba(232,234,240,0.6)" }}>${h.avg_cost.toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize: 14, color: h.pnl >= 0 ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)" }}>→</div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <div style={{ fontSize: 8, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Now</div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>${h.price.toFixed(2)}</div>
                    </div>
                  </div>
                  {/* Allocation bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 1, transition: "width 0.4s ease",
                        width: `${allocationPct}%`,
                        background: h.pnl >= 0 ? "#4ade80" : "#f87171",
                        opacity: 0.45 }} />
                    </div>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(232,234,240,0.4)" }}>{allocationPct.toFixed(1)}%</span>
                  </div>
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}
