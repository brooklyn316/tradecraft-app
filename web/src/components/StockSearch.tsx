"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface SearchResult {
  symbol:   string;
  name:     string;
  exchange: string;
}

interface Props {
  onSelect: (symbol: string, name: string) => void;
}

export default function StockSearch({ onSelect }: Props) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length === 0) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(() => search(q), 280);
  }

  function handleSelect(r: SearchResult) {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect(r.symbol, r.name);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}
    >
      <div style={{ position: "relative" }}>
        {/* Search icon */}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(232,234,240,0.55)", pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search any stock or company…"
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "8px 32px 8px 30px",
            fontSize: 12,
            color: "rgba(232,234,240,0.9)",
            outline: "none",
          }}
        />

        {/* Loading spinner */}
        {loading && (
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "rgba(232,234,240,0.55)" }}>
            ···
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", left: 12, right: 12, top: "calc(100% - 2px)", zIndex: 200,
          background: "#0d1526",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onClick={() => handleSelect(r)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "10px 12px", textAlign: "left",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(125,211,176,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: "#7dd3b0", minWidth: 52, flexShrink: 0 }}>
                {r.symbol}
              </span>
              <span style={{ fontSize: 11, color: "rgba(232,234,240,0.6)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
              </span>
              <span style={{ fontSize: 9, color: "rgba(232,234,240,0.48)", flexShrink: 0, marginLeft: 4 }}>
                {r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {open && !loading && query.length > 0 && results.length === 0 && (
        <div style={{
          position: "absolute", left: 12, right: 12, top: "calc(100% - 2px)", zIndex: 200,
          background: "#0d1526",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "14px 12px",
          fontSize: 12,
          color: "rgba(232,234,240,0.60)",
          textAlign: "center",
        }}>
          No results for "{query}"
        </div>
      )}
    </div>
  );
}
