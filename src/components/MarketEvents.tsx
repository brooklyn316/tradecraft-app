"use client";

import { useState, useEffect, useCallback } from "react";
import type { StockPrice } from "@/types";

interface MarketEventsProps {
  stocks: StockPrice[];
  onSelectStock: (stock: StockPrice) => void;
  onSwitchToTrade: () => void;
}

interface GameEvent {
  id: string;
  type: "price_alert" | "game_event";
  symbol?: string;
  headline: string;
  subline: string;
  sentiment: "bullish" | "bearish" | "neutral";
  urgency: "critical" | "high" | "medium";
  stock?: StockPrice;
  firedAt: number;
}

// Headlines for real price moves
function generatePriceHeadline(stock: StockPrice): { headline: string; subline: string; sentiment: "bullish" | "bearish"; urgency: "critical" | "high" | "medium" } {
  const pct   = stock.change_percent ?? 0;
  const abs   = Math.abs(pct);
  const up    = pct > 0;
  const sym   = stock.symbol;
  const name  = stock.company_name?.split(" ")[0] ?? sym;

  const bullishSublines = [
    "The Indexer is already rebalancing.",
    "Surge just went long. Are you watching?",
    "The bots reacted 3 minutes ago.",
    "Volume is spiking. This could continue.",
    "Options traders are betting it keeps going.",
  ];
  const bearishSublines = [
    "Wildcard just dumped its position.",
    "Surge already cut its losses.",
    "The Indexer is rebalancing away from it.",
    "Smart money is moving fast.",
    "Stop-losses are triggering across the board.",
  ];

  const randomSub = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (up) {
    if (abs >= 5) return {
      headline: `🚀 ${sym} SURGES ${pct.toFixed(1)}%`,
      subline: randomSub(bullishSublines),
      sentiment: "bullish", urgency: "critical",
    };
    if (abs >= 3) return {
      headline: `📈 ${name} jumps ${pct.toFixed(1)}% — momentum building`,
      subline: randomSub(bullishSublines),
      sentiment: "bullish", urgency: "high",
    };
    return {
      headline: `${sym} up ${pct.toFixed(1)}% — quiet move or start of a run?`,
      subline: randomSub(bullishSublines),
      sentiment: "bullish", urgency: "medium",
    };
  } else {
    if (abs >= 5) return {
      headline: `🔴 ${sym} CRASHES ${Math.abs(pct).toFixed(1)}% — panic selling`,
      subline: randomSub(bearishSublines),
      sentiment: "bearish", urgency: "critical",
    };
    if (abs >= 3) return {
      headline: `📉 ${name} falls ${Math.abs(pct).toFixed(1)}% — cutting position?`,
      subline: randomSub(bearishSublines),
      sentiment: "bearish", urgency: "high",
    };
    return {
      headline: `${sym} down ${Math.abs(pct).toFixed(1)}% — watch for bounce or breakdown`,
      subline: randomSub(bearishSublines),
      sentiment: "bearish", urgency: "medium",
    };
  }
}

// Periodic game events independent of price data
const GAME_EVENTS: { headline: string; subline: string; sentiment: "bullish" | "bearish" | "neutral"; urgency: "critical" | "high" | "medium" }[] = [
  { headline: "📣 FED SPEAKS in 30 minutes", subline: "Rate decision incoming. Markets are holding their breath. Position wisely.", sentiment: "neutral", urgency: "critical" },
  { headline: "💰 EARNINGS SEASON underway", subline: "12 S&P 500 companies report this week. Expect volatility.", sentiment: "neutral", urgency: "high" },
  { headline: "🛢️ OIL spikes — energy stocks reacting", subline: "Crude up 4.2%. XOM and CVX seeing unusual volume.", sentiment: "bullish", urgency: "high" },
  { headline: "🏦 BANK STRESS: Regional banks under pressure", subline: "Credit concerns hitting financials sector-wide.", sentiment: "bearish", urgency: "high" },
  { headline: "⚡ TECH ROTATION: Funds moving out of growth", subline: "Large-cap tech seeing outflows. Value stocks benefiting.", sentiment: "neutral", urgency: "medium" },
  { headline: "🌏 ASIA MARKETS close sharply lower", subline: "Nikkei down 2.1%. US futures are reacting pre-market.", sentiment: "bearish", urgency: "high" },
  { headline: "📊 CPI DATA: Inflation higher than expected", subline: "Markets repricing rate cut expectations. Risk-off move.", sentiment: "bearish", urgency: "critical" },
  { headline: "🤖 AI SPENDING boom drives chip demand", subline: "Semis sector up 3% this week on capex announcements.", sentiment: "bullish", urgency: "medium" },
  { headline: "🔒 SHORT SQUEEZE alert: Heavy shorted stocks moving", subline: "COIN, PLTR seeing abnormal buying pressure.", sentiment: "bullish", urgency: "high" },
  { headline: "📱 CONSUMER SPENDING beats estimates", subline: "Retail sales data outperforms. Consumer stocks rallying.", sentiment: "bullish", urgency: "medium" },
];

const URGENCY_STYLES = {
  critical: { accent: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)", dot: "#f87171" },
  high:     { accent: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.25)",  dot: "#f59e0b" },
  medium:   { accent: "#60a5fa", bg: "rgba(96,165,250,0.06)",  border: "rgba(96,165,250,0.2)",   dot: "#60a5fa" },
};

const SENTIMENT_LABEL = {
  bullish: { text: "BULLISH", color: "#4ade80" },
  bearish: { text: "BEARISH", color: "#f87171" },
  neutral: { text: "WATCH",   color: "#f59e0b" },
};

export default function MarketEvents({ stocks, onSelectStock, onSwitchToTrade }: MarketEventsProps) {
  const [events, setEvents]           = useState<GameEvent[]>([]);
  const [activeIdx, setActiveIdx]     = useState(0);
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set());
  const [gameEventIdx, setGameEventIdx] = useState(() => Math.floor(Math.random() * GAME_EVENTS.length));

  // Build events from price data whenever stocks update
  useEffect(() => {
    if (!stocks.length) return;

    const movers = stocks
      .filter(s => s.change_percent !== null && Math.abs(s.change_percent!) >= 1.5)
      .sort((a, b) => Math.abs(b.change_percent!) - Math.abs(a.change_percent!))
      .slice(0, 5);

    const priceEvents: GameEvent[] = movers.map(s => {
      const { headline, subline, sentiment, urgency } = generatePriceHeadline(s);
      return {
        id:        `price_${s.symbol}`,
        type:      "price_alert",
        symbol:    s.symbol,
        headline,
        subline,
        sentiment,
        urgency,
        stock:     s,
        firedAt:   Date.now(),
      };
    });

    // Add one game event
    const ge = GAME_EVENTS[gameEventIdx];
    const gameEvent: GameEvent = {
      id:       `game_${gameEventIdx}`,
      type:     "game_event",
      headline: ge.headline,
      subline:  ge.subline,
      sentiment: ge.sentiment,
      urgency:  ge.urgency,
      firedAt:  Date.now(),
    };

    const all = [...priceEvents, gameEvent].filter(e => !dismissed.has(e.id));
    setEvents(all);
    setActiveIdx(0);
  }, [stocks, gameEventIdx, dismissed]);

  // Rotate game event every 8 minutes
  useEffect(() => {
    const t = setInterval(() => {
      setGameEventIdx(i => (i + 1) % GAME_EVENTS.length);
    }, 8 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-rotate banner every 12 seconds
  useEffect(() => {
    if (events.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx(i => (i + 1) % events.length);
    }, 12_000);
    return () => clearInterval(t);
  }, [events.length]);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const handleTrade = useCallback((event: GameEvent) => {
    if (event.stock) {
      onSelectStock(event.stock);
      onSwitchToTrade();
    }
  }, [onSelectStock, onSwitchToTrade]);

  if (events.length === 0) return null;

  const active = events[Math.min(activeIdx, events.length - 1)];
  const style  = URGENCY_STYLES[active.urgency];
  const sentimentLabel = SENTIMENT_LABEL[active.sentiment];

  return (
    <div style={{ padding: "8px 12px 0", flexShrink: 0 }}>
      {/* Main alert banner */}
      <div style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        position: "relative",
        marginBottom: 6,
        transition: "all 0.3s ease",
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          {/* Pulsing dot */}
          <div style={{ position: "relative", flexShrink: 0, marginTop: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: style.dot }} />
            <div style={{
              position: "absolute", top: -2, left: -2,
              width: 11, height: 11, borderRadius: "50%",
              background: style.dot, opacity: 0.25,
              animation: "ping 1.5s ease-in-out infinite",
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Sentiment + type tag */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: "0.1em",
                padding: "2px 6px", borderRadius: 4,
                color: sentimentLabel.color,
                background: `${sentimentLabel.color}18`,
                border: `1px solid ${sentimentLabel.color}40`,
              }}>
                {sentimentLabel.text}
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {active.type === "price_alert" ? `${active.symbol} · MARKET ALERT` : "MARKET EVENT"}
              </span>
            </div>

            {/* Headline */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.92)", lineHeight: 1.35, marginBottom: 3 }}>
              {active.headline}
            </div>

            {/* Subline */}
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.52)", lineHeight: 1.4 }}>
              {active.subline}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => dismiss(active.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(232,234,240,0.35)", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Action row */}
        {active.stock && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <button
              onClick={() => handleTrade(active)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: style.accent + "20", border: `1px solid ${style.accent}50`, color: style.accent,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = style.accent + "35")}
              onMouseLeave={e => (e.currentTarget.style.background = style.accent + "20")}
            >
              Trade {active.symbol} →
            </button>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.5)" }}>
              ${active.stock.price.toFixed(2)} · {(active.stock.change_percent ?? 0) >= 0 ? "+" : ""}{(active.stock.change_percent ?? 0).toFixed(2)}%
            </span>
          </div>
        )}

        {/* Pagination dots */}
        {events.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 8 }}>
            {events.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  width: i === activeIdx ? 14 : 5, height: 5, borderRadius: 99, border: "none", cursor: "pointer",
                  background: i === activeIdx ? style.dot : "rgba(255,255,255,0.15)",
                  padding: 0, transition: "all 0.25s ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ping {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50%       { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
