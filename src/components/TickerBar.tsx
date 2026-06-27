"use client";

import { useState, useMemo } from "react";
import type { StockPrice } from "@/types";

interface TickerBarProps {
  stocks: StockPrice[];
  onSelect: (stock: StockPrice) => void;
}

export default function TickerBar({ stocks, onSelect }: TickerBarProps) {
  const [paused, setPaused] = useState(false);

  const sorted = useMemo(() => {
    return [...stocks].sort(
      (a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0)
    );
  }, [stocks]);

  if (sorted.length === 0) return null;

  const duration = Math.max(30, sorted.length * 3);
  const items = [...sorted, ...sorted];

  return (
    <div
      style={{
        height: 28,
        background: "rgba(255,255,255,0.018)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fade edges */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 40, zIndex: 2,
        background: "linear-gradient(to right, #060a14, transparent)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 40, zIndex: 2,
        background: "linear-gradient(to left, #060a14, transparent)",
        pointerEvents: "none",
      }} />

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      <div style={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        width: "max-content",
        animation: `ticker-scroll ${duration}s linear infinite`,
        animationPlayState: paused ? "paused" : "running",
      }}>
        {items.map((stock, i) => {
          const chg = stock.change_percent ?? 0;
          const isUp = chg >= 0;
          const color = isUp ? "#4ade80" : "#f87171";
          const arrow = isUp ? "▲" : "▼";

          return (
            <button
              key={`${stock.symbol}-${i}`}
              onClick={() => onSelect(stock)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "0 18px",
                borderRight: "1px solid rgba(255,255,255,0.04)",
                height: "100%",
                flexShrink: 0,
                cursor: "pointer",
                background: "transparent",
                border: "none",
                outline: "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{
                fontSize: 10, fontWeight: 800, fontFamily: "monospace",
                color: "rgba(232,234,240,0.75)", letterSpacing: "0.04em",
                pointerEvents: "none",
              }}>
                {stock.symbol}
              </span>
              <span style={{
                fontSize: 10, fontFamily: "monospace",
                color: "rgba(232,234,240,0.65)",
                pointerEvents: "none",
              }}>
                ${stock.price.toFixed(2)}
              </span>
              <span style={{
                fontSize: 9, fontFamily: "monospace", fontWeight: 700, color,
                display: "flex", alignItems: "center", gap: 2,
                pointerEvents: "none",
              }}>
                <span style={{ fontSize: 7 }}>{arrow}</span>
                {Math.abs(chg).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
