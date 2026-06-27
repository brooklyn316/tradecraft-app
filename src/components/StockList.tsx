"use client";

import { useState, useEffect, useRef } from "react";
import type { StockPrice } from "@/types";

interface StockListProps {
  stocks: StockPrice[];
  selectedSymbol: string;
  onSelect: (stock: StockPrice) => void;
  watchedSymbols?: string[];
  onToggleWatch?: (symbol: string) => void;
}

// ── Sector assignments ────────────────────────────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  AAPL:"Tech", MSFT:"Tech", GOOGL:"Tech", META:"Tech", NVDA:"Tech", AMD:"Tech", INTC:"Tech", CRM:"Tech", ADBE:"Tech", ORCL:"Tech",
  AMZN:"E-Commerce", SHOP:"E-Commerce", EBAY:"E-Commerce",
  TSLA:"EV & Auto", F:"EV & Auto", GM:"EV & Auto", RIVN:"EV & Auto",
  NFLX:"Media", DIS:"Media", SPOT:"Media", SNAP:"Media", TWTR:"Media", RBLX:"Media",
  JPM:"Finance", BAC:"Finance", GS:"Finance", V:"Finance", MA:"Finance", PYPL:"Finance", COIN:"Finance",
  JNJ:"Healthcare", PFE:"Healthcare", UNH:"Healthcare", ABBV:"Healthcare", MRK:"Healthcare", MRNA:"Healthcare",
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy",
  WMT:"Retail", TGT:"Retail", COST:"Retail", HD:"Retail",
  KO:"Consumer", PEP:"Consumer", MCD:"Consumer", SBUX:"Consumer",
  BA:"Aerospace", LMT:"Aerospace", RTX:"Aerospace",
  LYFT:"Transport", UBER:"Transport",
  PLTR:"Software", SNOW:"Software", ZM:"Software", DDOG:"Software",
  SPY:"ETF", QQQ:"ETF", IWM:"ETF",
  AMGN:"Biotech", GILD:"Biotech",
};

function getSector(symbol: string) {
  return SECTOR_MAP[symbol] ?? "Other";
}

const SECTOR_ICONS: Record<string, string> = {
  "Tech":"💻", "E-Commerce":"🛒", "EV & Auto":"🚗", "Media":"📺", "Finance":"🏦",
  "Healthcare":"⚕️", "Energy":"⚡", "Retail":"🏪", "Consumer":"☕", "Aerospace":"✈️",
  "Transport":"🚕", "Software":"🖥️", "ETF":"📊", "Biotech":"🧬", "Other":"📈",
};

type ViewMode = "list" | "sectors";

export default function StockList({ stocks, selectedSymbol, onSelect, watchedSymbols = [], onToggleWatch }: StockListProps) {
  const prevPrices = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down" | null>>({});
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [collapsedSectors, setCollapsedSectors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const updates: Record<string, "up" | "down" | null> = {};
    stocks.forEach(s => {
      const prev = prevPrices.current[s.symbol];
      if (prev !== undefined && prev !== s.price) updates[s.symbol] = s.price > prev ? "up" : "down";
      prevPrices.current[s.symbol] = s.price;
    });
    if (Object.keys(updates).length > 0) {
      setFlashMap(updates);
      setTimeout(() => setFlashMap({}), 1000);
    }
  }, [stocks]);

  // Build sector groups
  const sectorGroups: Record<string, StockPrice[]> = {};
  for (const stock of stocks) {
    const sector = getSector(stock.symbol);
    if (!sectorGroups[sector]) sectorGroups[sector] = [];
    sectorGroups[sector].push(stock);
  }

  // Sort sectors by avg change (best first)
  const sortedSectors = Object.entries(sectorGroups).sort(([, a], [, b]) => {
    const avgA = a.reduce((s, x) => s + (x.change_percent ?? 0), 0) / a.length;
    const avgB = b.reduce((s, x) => s + (x.change_percent ?? 0), 0) / b.length;
    return avgB - avgA;
  });

  function toggleSector(sector: string) {
    setCollapsedSectors(prev => {
      const next = new Set(prev);
      next.has(sector) ? next.delete(sector) : next.add(sector);
      return next;
    });
  }

  function StockRow({ stock }: { stock: StockPrice }) {
    const isSelected = stock.symbol === selectedSymbol;
    const isPositive = (stock.change_percent ?? 0) >= 0;
    const flash = flashMap[stock.symbol];
    return (
      <button onClick={() => onSelect(stock)}
        style={{ width:"100%", display:"grid", gridTemplateColumns:"1fr 90px 80px 32px", alignItems:"center",
          padding:"9px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer", outline:"none", textAlign:"left",
          background: isSelected ? "rgba(125,211,176,0.07)" : "transparent",
          borderLeft: isSelected ? "3px solid #7dd3b0" : "3px solid transparent",
          borderTop:"none", borderRight:"none" }}>

        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color: isSelected ? "#7dd3b0" : "rgba(232,234,240,0.9)" }}>{stock.symbol}</span>
            <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4,
              background: isPositive ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              color: isPositive ? "#4ade80" : "#f87171" }}>
              {isPositive ? "▲" : "▼"}
            </span>
          </div>
          <div style={{ fontSize:11, color:"rgba(232,234,240,0.58)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>
            {stock.company_name ?? ""}
          </div>
        </div>

        <div style={{ textAlign:"right", fontSize:14, fontFamily:"monospace", fontWeight:600,
          color: flash==="up" ? "#4ade80" : flash==="down" ? "#f87171" : "rgba(232,234,240,0.85)" }}>
          ${stock.price.toFixed(2)}
        </div>

        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:700, color: isPositive ? "#4ade80" : "#f87171" }}>
            {isPositive ? "+" : ""}{(stock.change_percent ?? 0).toFixed(2)}%
          </div>
          <div style={{ height:2, background:"rgba(255,255,255,0.05)", borderRadius:1, marginTop:4, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${Math.min(100, Math.abs(stock.change_percent ?? 0) * 10)}%`, background: isPositive ? "#4ade80" : "#f87171", opacity:0.6 }} />
          </div>
        </div>

        <div style={{ textAlign:"right" }}>
          {onToggleWatch && (
            <button onClick={e => { e.stopPropagation(); onToggleWatch(stock.symbol); }}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, padding:"2px 4px", borderRadius:4, lineHeight:1,
                color: watchedSymbols.includes(stock.symbol) ? "#7dd3b0" : "rgba(232,234,240,0.45)" }}>
              ★
            </button>
          )}
        </div>
      </button>
    );
  }

  const displayed = showAll ? stocks : stocks.slice(0, 10);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>

      {/* View toggle */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 12px 5px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 80px 32px", flex:1, paddingLeft:4 }}>
          {["Symbol","Last","Chg %",""].map((h, i) => (
            <span key={i} style={{ fontSize:11, fontWeight:700, color:"rgba(232,234,240,0.5)", textTransform:"uppercase", letterSpacing:"0.07em", textAlign:i>0?"right":"left" }}>{h}</span>
          ))}
        </div>
        {/* List / Sectors toggle */}
        <div style={{ display:"flex", background:"rgba(255,255,255,0.04)", borderRadius:7, padding:2, border:"1px solid rgba(255,255,255,0.07)", marginLeft:10, flexShrink:0 }}>
          {([["list","List"],["sectors","Sectors"]] as [ViewMode,string][]).map(([v, label]) => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{ padding:"3px 9px", borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer", border:"none", transition:"all 0.15s",
                background: viewMode===v ? "rgba(255,255,255,0.08)" : "transparent",
                color: viewMode===v ? "rgba(232,234,240,0.85)" : "rgba(232,234,240,0.52)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List view ── */}
      {viewMode === "list" && (
        <div style={{ flex:1, overflowY:"auto" }}>
          {displayed.map(stock => <StockRow key={stock.symbol} stock={stock} />)}
          {stocks.length > 10 && (
            <button onClick={() => setShowAll(v => !v)}
              style={{ width:"100%", padding:"10px 16px", border:"none", background:"rgba(255,255,255,0.03)", cursor:"pointer", fontSize:12, fontWeight:600,
                color:"rgba(232,234,240,0.4)", borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {showAll ? "▲ Show less" : `▼ Show all ${stocks.length} stocks`}
            </button>
          )}
        </div>
      )}

      {/* ── Sector view ── */}
      {viewMode === "sectors" && (
        <div style={{ flex:1, overflowY:"auto" }}>
          {sortedSectors.map(([sector, sectorStocks]) => {
            const avgChange = sectorStocks.reduce((s, x) => s + (x.change_percent ?? 0), 0) / sectorStocks.length;
            const isUp = avgChange >= 0;
            const collapsed = collapsedSectors.has(sector);
            const icon = SECTOR_ICONS[sector] ?? "📈";

            return (
              <div key={sector}>
                {/* Sector header */}
                <button onClick={() => toggleSector(sector)}
                  style={{ width:"100%", display:"flex", alignItems:"center", padding:"8px 16px", background:"rgba(255,255,255,0.025)", border:"none", borderBottom:"1px solid rgba(255,255,255,0.05)", cursor:"pointer", gap:8 }}>
                  <span style={{ fontSize:14 }}>{icon}</span>
                  <span style={{ flex:1, fontSize:12, fontWeight:700, color:"rgba(232,234,240,0.7)", textAlign:"left" }}>{sector}</span>
                  <span style={{ fontSize:10, color:"rgba(232,234,240,0.52)", fontFamily:"monospace", marginRight:8 }}>
                    {sectorStocks.length} stock{sectorStocks.length !== 1 ? "s" : ""}
                  </span>
                  {/* Avg change badge */}
                  <span style={{ fontSize:11, fontWeight:800, fontFamily:"monospace", padding:"2px 8px", borderRadius:6,
                    background: isUp ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                    color: isUp ? "#4ade80" : "#f87171",
                    border: `1px solid ${isUp ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}` }}>
                    {isUp ? "+" : ""}{avgChange.toFixed(2)}%
                  </span>
                  {/* Mini bar */}
                  <div style={{ width:32, height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden", flexShrink:0 }}>
                    <div style={{ height:"100%", width:`${Math.min(100, Math.abs(avgChange) * 8)}%`, background: isUp ? "#4ade80" : "#f87171", opacity:0.7 }} />
                  </div>
                  <span style={{ fontSize:10, color:"rgba(232,234,240,0.5)", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition:"transform 0.2s", marginLeft:2 }}>▾</span>
                </button>

                {/* Stocks in sector */}
                {!collapsed && sectorStocks.map(stock => <StockRow key={stock.symbol} stock={stock} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
