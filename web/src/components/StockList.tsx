"use client";

import { useState, useEffect, useRef } from "react";
import type { StockPrice } from "@/types";
import { CRYPTO_SYMBOLS } from "@/lib/crypto-prices";
import { NZX_SYMBOLS } from "@/lib/nzx-stocks";
import { isNYSEOpen, isNZXOpen } from "@/lib/market-hours";

interface StockListProps {
  stocks: StockPrice[];
  selectedSymbol: string;
  onSelect: (stock: StockPrice) => void;
  watchedSymbols?: string[];
  onToggleWatch?: (symbol: string) => void;
}

const CRYPTO_SET = new Set<string>(CRYPTO_SYMBOLS as unknown as string[]);
const NZX_SET    = new Set<string>(NZX_SYMBOLS    as unknown as string[]);

function getMarket(symbol: string): "crypto" | "nzx" | "us" {
  if (CRYPTO_SET.has(symbol)) return "crypto";
  if (NZX_SET.has(symbol) || symbol.endsWith(".NZ")) return "nzx";
  return "us";
}

// ── Single stock row ──────────────────────────────────────────────────────────
function StockRow({
  stock, isSelected, flash, onSelect, onToggleWatch, watched,
}: {
  stock: StockPrice;
  isSelected: boolean;
  flash: "up" | "down" | null;
  onSelect: (s: StockPrice) => void;
  onToggleWatch?: (sym: string) => void;
  watched: boolean;
}) {
  const isPositive = (stock.change_percent ?? 0) >= 0;
  const market = getMarket(stock.symbol);
  const priceStr = market === "crypto" && stock.price < 1
    ? `$${stock.price.toFixed(4)}`
    : `$${stock.price.toFixed(2)}`;

  return (
    <button
      onClick={() => onSelect(stock)}
      style={{
        width: "100%", display: "grid",
        gridTemplateColumns: "1fr 90px 72px 28px",
        alignItems: "center", padding: "9px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer", outline: "none", textAlign: "left",
        background: isSelected ? "rgba(125,211,176,0.07)" : "transparent",
        borderLeft: isSelected ? "3px solid #7dd3b0" : "3px solid transparent",
        borderTop: "none", borderRight: "none", transition: "background 0.1s",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "#7dd3b0" : "rgba(232,234,240,0.9)" }}>
            {stock.symbol}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
            background: isPositive ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            color: isPositive ? "#4ade80" : "#f87171",
          }}>{isPositive ? "▲" : "▼"}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(232,234,240,0.52)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stock.company_name ?? ""}
        </div>
      </div>

      <div style={{
        textAlign: "right", fontSize: 13, fontFamily: "monospace", fontWeight: 600,
        color: flash === "up" ? "#4ade80" : flash === "down" ? "#f87171" : "rgba(232,234,240,0.85)",
        transition: "color 0.3s",
      }}>
        {priceStr}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: isPositive ? "#4ade80" : "#f87171" }}>
          {isPositive ? "+" : ""}{(stock.change_percent ?? 0).toFixed(2)}%
        </div>
        <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, marginTop: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, Math.abs(stock.change_percent ?? 0) * 10)}%`, background: isPositive ? "#4ade80" : "#f87171", opacity: 0.55 }} />
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        {onToggleWatch && (
          <button
            onClick={e => { e.stopPropagation(); onToggleWatch(stock.symbol); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px", lineHeight: 1, color: watched ? "#7dd3b0" : "rgba(232,234,240,0.3)" }}
          >★</button>
        )}
      </div>
    </button>
  );
}

// ── Section divider with market status ────────────────────────────────────────
function SectionHeader({ label, emoji, isOpen, statusLabel, count }: {
  label: string; emoji: string; isOpen: boolean; statusLabel: string; count: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 14px 6px",
      background: "rgba(255,255,255,0.02)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      position: "sticky", top: 0, zIndex: 2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 12 }}>{emoji}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.75)", letterSpacing: "0.03em" }}>{label}</span>
        <span style={{ fontSize: 10, color: "rgba(232,234,240,0.35)" }}>{count}</span>
      </div>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", padding: "2px 7px", borderRadius: 99,
        background: isOpen ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
        color: isOpen ? "#4ade80" : "rgba(232,234,240,0.35)",
        border: `1px solid ${isOpen ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`,
      }}>
        {isOpen ? "●" : "○"} {statusLabel}
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StockList({ stocks, selectedSymbol, onSelect, watchedSymbols = [], onToggleWatch }: StockListProps) {
  const prevPrices = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap]   = useState<Record<string, "up" | "down" | null>>({});
  const [nyseOpen, setNyseOpen]   = useState(isNYSEOpen());
  const [nzxOpen,  setNzxOpen]    = useState(isNZXOpen());
  const [showAllUS, setShowAllUS] = useState(false);

  // Flash cells on price change
  useEffect(() => {
    const updates: Record<string, "up" | "down" | null> = {};
    stocks.forEach(s => {
      const prev = prevPrices.current[s.symbol];
      if (prev !== undefined && prev !== s.price) updates[s.symbol] = s.price > prev ? "up" : "down";
      prevPrices.current[s.symbol] = s.price;
    });
    if (Object.keys(updates).length) {
      setFlashMap(updates);
      setTimeout(() => setFlashMap({}), 1000);
    }
  }, [stocks]);

  // Refresh market status every minute
  useEffect(() => {
    const id = setInterval(() => { setNyseOpen(isNYSEOpen()); setNzxOpen(isNZXOpen()); }, 60_000);
    return () => clearInterval(id);
  }, []);

  const usStocks     = stocks.filter(s => getMarket(s.symbol) === "us");
  const nzxStocks    = stocks.filter(s => getMarket(s.symbol) === "nzx");
  const cryptoStocks = stocks.filter(s => getMarket(s.symbol) === "crypto");

  // When showing multiple market sections, cap US at 4 so the other sections are visible without scrolling
  const hasMultipleSections = [usStocks, nzxStocks, cryptoStocks].filter(a => a.length > 0).length > 1;
  const usCollapseAt = hasMultipleSections ? 4 : 12;
  const displayedUS  = showAllUS ? usStocks : usStocks.slice(0, usCollapseAt);

  function row(s: StockPrice) {
    return (
      <StockRow key={s.symbol} stock={s} isSelected={s.symbol === selectedSymbol}
        flash={flashMap[s.symbol] ?? null} onSelect={onSelect}
        onToggleWatch={onToggleWatch} watched={watchedSymbols.includes(s.symbol)} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 72px 28px", padding: "5px 14px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        {["Symbol", "Last", "Chg %", ""].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: i > 0 ? "right" : "left" }}>{h}</span>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* US Stocks */}
        {usStocks.length > 0 && <>
          <SectionHeader label="US Stocks" emoji="🇺🇸" isOpen={nyseOpen}
            statusLabel={nyseOpen ? "NYSE OPEN" : "NYSE CLOSED"} count={usStocks.length} />
          {displayedUS.map(row)}
          {usStocks.length > usCollapseAt && (
            <button onClick={() => setShowAllUS(v => !v)} style={{
              width: "100%", padding: "9px 14px", border: "none",
              background: "rgba(255,255,255,0.02)", cursor: "pointer",
              fontSize: 11, fontWeight: 600, color: "rgba(232,234,240,0.4)",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              {showAllUS ? "▲ Show fewer" : `▼ Show all ${usStocks.length} US stocks`}
            </button>
          )}
        </>}

        {/* NZ Stocks */}
        {nzxStocks.length > 0 && <>
          <SectionHeader label="NZ Stocks" emoji="🇳🇿" isOpen={nzxOpen}
            statusLabel={nzxOpen ? "NZX OPEN" : "NZX CLOSED"} count={nzxStocks.length} />
          {nzxStocks.map(row)}
        </>}

        {/* Crypto */}
        {cryptoStocks.length > 0 && <>
          <SectionHeader label="Crypto" emoji="₿" isOpen={true}
            statusLabel="24/7" count={cryptoStocks.length} />
          {cryptoStocks.map(row)}
        </>}

        {stocks.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "rgba(232,234,240,0.4)", fontSize: 12 }}>
            Loading market data…
          </div>
        )}
      </div>
    </div>
  );
}
