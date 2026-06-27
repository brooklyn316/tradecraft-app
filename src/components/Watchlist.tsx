"use client";

import { useEffect, useState } from "react";
import type { StockPrice } from "@/types";
import { getWatchlist, removeFromWatchlist, addToWatchlist, fetchStockPrices } from "@/lib/stockApi";
import { getSupabaseClient } from "@/lib/supabase";

interface WatchlistProps {
  userId: string;
  stocks: StockPrice[];
  onSelect: (stock: StockPrice) => void;
}

export default function Watchlist({ userId, stocks, onSelect }: WatchlistProps) {
  const [watchedSymbols, setWatchedSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<StockPrice | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    getWatchlist(userId)
      .then(data => setWatchedSymbols(data.map(d => d.symbol)))
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleSearch() {
    const sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError(null);

    // Check if already in stocks list
    const existing = stocks.find(s => s.symbol === sym);
    if (existing) {
      setSearchResult(existing);
      setSearching(false);
      return;
    }

    // Fetch from edge function
    try {
      const result = await fetchStockPrices([sym]);
      if (result?.[sym]?.price) {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from("stock_prices").select("*").eq("symbol", sym).single();
        if (data) setSearchResult(data);
        else setSearchError("Symbol not found. Check the ticker and try again.");
      } else {
        setSearchError("Symbol not found. Check the ticker and try again.");
      }
    } catch {
      setSearchError("Failed to fetch. Try again.");
    }
    setSearching(false);
  }

  async function handleAdd(symbol: string) {
    await addToWatchlist(userId, symbol);
    setWatchedSymbols(prev => [...prev, symbol]);
    setSearchInput("");
    setSearchResult(null);
  }

  async function handleRemove(symbol: string, e: React.MouseEvent) {
    e.stopPropagation();
    await removeFromWatchlist(userId, symbol);
    setWatchedSymbols(prev => prev.filter(s => s !== symbol));
  }

  const watchedStocks = watchedSymbols
    .map(sym => stocks.find(s => s.symbol === sym))
    .filter(Boolean) as StockPrice[];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>

      {/* Search bar */}
      <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value.toUpperCase()); setSearchResult(null); setSearchError(null); }}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search ticker e.g. AAPL, TSLA…"
            style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"8px 12px", fontSize:13, color:"white", outline:"none", fontFamily:"monospace" }}
          />
          <button onClick={handleSearch} disabled={searching || !searchInput.trim()}
            style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"rgba(125,211,176,0.12)", color:"#7dd3b0", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", opacity: searchInput.trim() ? 1 : 0.4 }}>
            {searching ? "…" : "Search"}
          </button>
        </div>

        {/* Search result */}
        {searchResult && (
          <div style={{ marginTop:8, padding:"10px 12px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:14, fontWeight:700, color:"white" }}>{searchResult.symbol}</span>
                <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:600, color:(searchResult.change_percent??0)>=0?"#4ade80":"#f87171" }}>
                  {(searchResult.change_percent??0)>=0?"+":""}{(searchResult.change_percent??0).toFixed(2)}%
                </span>
              </div>
              <div style={{ fontSize:12, color:"rgba(232,234,240,0.60)", marginTop:2 }}>${searchResult.price.toFixed(2)} · {searchResult.company_name}</div>
            </div>
            {watchedSymbols.includes(searchResult.symbol) ? (
              <span style={{ fontSize:12, color:"#7dd3b0" }}>★ Watching</span>
            ) : (
              <button onClick={() => handleAdd(searchResult!.symbol)}
                style={{ padding:"6px 12px", borderRadius:7, border:"1px solid rgba(125,211,176,0.3)", background:"rgba(125,211,176,0.1)", color:"#7dd3b0", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                + Add to Watchlist
              </button>
            )}
          </div>
        )}
        {searchError && (
          <div style={{ marginTop:8, fontSize:12, color:"#f87171", padding:"6px 0" }}>{searchError}</div>
        )}
      </div>

      {/* Watched stocks list */}
      {loading ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, color:"rgba(232,234,240,0.52)", fontSize:13 }}>Loading...</div>
      ) : watchedStocks.length === 0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:8, padding:20 }}>
          <div style={{ fontSize:28 }}>★</div>
          <div style={{ fontSize:13, color:"rgba(232,234,240,0.60)", fontWeight:500 }}>Your watchlist is empty</div>
          <div style={{ fontSize:12, color:"rgba(232,234,240,0.5)", textAlign:"center", maxWidth:220 }}>
            Search for a ticker above, or click ★ on any stock in Live Markets
          </div>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:"auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 80px 32px", padding:"6px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            {["Symbol","Last","Chg %",""].map((h,i) => (
              <span key={i} style={{ fontSize:11, fontWeight:700, color:"rgba(232,234,240,0.5)", textTransform:"uppercase", letterSpacing:"0.07em", textAlign:i>0?"right":"left" }}>{h}</span>
            ))}
          </div>
          {watchedStocks.map(stock => {
            const isPositive = (stock.change_percent??0)>=0;
            return (
              <button key={stock.symbol} onClick={() => onSelect(stock)}
                style={{ width:"100%", display:"grid", gridTemplateColumns:"1fr 90px 80px 32px", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer", outline:"none", textAlign:"left", background:"transparent", border:"none" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"rgba(232,234,240,0.9)" }}>{stock.symbol}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:isPositive?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)", color:isPositive?"#4ade80":"#f87171" }}>
                      {isPositive?"▲":"▼"}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:"rgba(232,234,240,0.58)", marginTop:2 }}>{stock.company_name??""}</div>
                </div>
                <div style={{ textAlign:"right", fontSize:14, fontFamily:"monospace", fontWeight:600, color:"rgba(232,234,240,0.85)" }}>${stock.price.toFixed(2)}</div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:700, color:isPositive?"#4ade80":"#f87171" }}>
                    {isPositive?"+":""}{(stock.change_percent??0).toFixed(2)}%
                  </div>
                  <div style={{ height:2, background:"rgba(255,255,255,0.05)", borderRadius:1, marginTop:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.min(100,Math.abs(stock.change_percent??0)*10)}%`, background:isPositive?"#4ade80":"#f87171", opacity:0.6 }} />
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <button onClick={e => handleRemove(stock.symbol, e)}
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#7dd3b0", padding:"2px 4px" }}>★</button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
