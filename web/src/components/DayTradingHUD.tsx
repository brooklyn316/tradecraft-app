"use client";

import { useEffect, useState } from "react";
import type { CompetitionParticipant, Holding, StockPrice, Trade } from "@/types";

interface DayTradingHUDProps {
  participant: CompetitionParticipant;
  holdings: Holding[];
  prices: StockPrice[];
  trades: Trade[];
  startingCash: number;
}

function getETTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function useMarketCountdown() {
  const [label, setLabel]   = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const et = getETTime();
      const h = et.getHours();
      const m = et.getMinutes();
      const s = et.getSeconds();
      const totalMins = h * 60 + m;

      if (totalMins < 9 * 60 + 30) {
        // Pre-market
        const diffSecs = (9 * 60 + 30 - totalMins) * 60 - s;
        const dh = Math.floor(diffSecs / 3600);
        const dm = Math.floor((diffSecs % 3600) / 60);
        setLabel(dh > 0 ? `Opens in ${dh}h ${dm}m` : `Opens in ${dm}m ${diffSecs % 60}s`);
        setUrgent(false);
      } else if (totalMins < 16 * 60) {
        // Market open — count down to close
        const closeAt = 16 * 60 * 60; // 4pm in seconds from midnight
        const nowSecs = h * 3600 + m * 60 + s;
        const diffSecs = closeAt - nowSecs;
        const dh = Math.floor(diffSecs / 3600);
        const dm = Math.floor((diffSecs % 3600) / 60);
        const ds = diffSecs % 60;
        if (dh > 0) {
          setLabel(`Closes in ${dh}h ${dm}m`);
        } else if (dm > 0) {
          setLabel(`Closes in ${dm}m ${ds.toString().padStart(2,"0")}s`);
        } else {
          setLabel(`Closing in ${ds}s`);
        }
        setUrgent(diffSecs < 600); // red in final 10 min
      } else {
        setLabel("Market closed");
        setUrgent(false);
      }
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  return { label, urgent };
}

export default function DayTradingHUD({ participant, holdings, prices, trades, startingCash }: DayTradingHUDProps) {
  const { label: countdownLabel, urgent } = useMarketCountdown();

  const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p]));

  // Today's trade count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = trades.filter(t => new Date(t.executed_at) >= todayStart).length;

  // Portfolio value
  const holdingsValue = holdings.reduce((sum, h) => {
    const p = priceMap[h.symbol]?.price ?? h.avg_cost;
    return sum + h.shares * p;
  }, 0);
  const totalValue = participant.cash_balance + holdingsValue;
  const dayPnl     = totalValue - startingCash;
  const dayPnlPct  = (dayPnl / startingCash) * 100;
  const isPositive = dayPnl >= 0;

  const openPositions = holdings.length;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "0 16px",
      height: 38,
      background: urgent
        ? "rgba(248,113,113,0.07)"
        : "rgba(251,191,36,0.04)",
      borderBottom: `1px solid ${urgent ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.12)"}`,
      flexShrink: 0,
      overflow: "hidden",
    }}>

      {/* Day trade badge */}
      <div style={{
        fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 4,
        background: urgent ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.12)",
        color: urgent ? "#f87171" : "#fbbf24",
        letterSpacing: "0.08em",
        marginRight: 12,
        flexShrink: 0,
      }}>
        ⚡ DAY TRADE
      </div>

      {/* Countdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 20, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700,
          color: urgent ? "#f87171" : "rgba(232,234,240,0.7)",
          animation: urgent ? "pulse 1s ease-in-out infinite" : "none" }}>
          {countdownLabel}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)", marginRight: 20, flexShrink: 0 }} />

      {/* Today's P&L */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 20, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Day P&L
        </span>
        <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700,
          color: isPositive ? "#4ade80" : "#f87171" }}>
          {isPositive ? "+" : ""}{dayPnl.toFixed(0) === "0" ? "—" : `$${Math.abs(dayPnl).toFixed(0)}`}
        </span>
        {dayPnl !== 0 && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: isPositive ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)" }}>
            {isPositive ? "+" : ""}{dayPnlPct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)", marginRight: 20, flexShrink: 0 }} />

      {/* Trade count */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 20, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Trades</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>{todayTrades}</span>
      </div>

      {/* Open positions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Open</span>
        <span style={{
          fontSize: 12, fontFamily: "monospace", fontWeight: 700,
          color: urgent && openPositions > 0 ? "#f87171" : "rgba(232,234,240,0.7)",
        }}>{openPositions}</span>
        {urgent && openPositions > 0 && (
          <span style={{ fontSize: 9, color: "#f87171", fontWeight: 700, animation: "pulse 1s ease-in-out infinite" }}>
            ← close now
          </span>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </div>
  );
}
