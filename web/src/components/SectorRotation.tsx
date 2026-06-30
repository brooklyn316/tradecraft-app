"use client";

import { useCallback, useEffect, useState } from "react";
import type { SectorStats, PlayerAllocation } from "@/lib/sectors";
import { SECTOR_MAP } from "@/lib/sectors";
import type { StockPrice } from "@/types";

interface SectorRotationProps {
  participantId: string | null;
  stocks:        StockPrice[];
  onSelectSymbol?: (symbol: string) => void;
}

export default function SectorRotation({ participantId, stocks, onSelectSymbol }: SectorRotationProps) {
  const [sectors,       setSectors]       = useState<SectorStats[]>([]);
  const [allocation,    setAllocation]    = useState<PlayerAllocation[]>([]);
  const [rotationScore, setRotationScore] = useState(0);
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);

  const load = useCallback(async () => {
    const url = participantId
      ? `/api/sectors?participantId=${participantId}`
      : "/api/sectors";
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const { sectors: s, allocation: a, rotationScore: r } = await res.json();
      setSectors(s ?? []);
      setAllocation(a ?? []);
      setRotationScore(r ?? 0);
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Sorted: best → worst
  const sorted = [...sectors].sort((a, b) => b.avg_change_pct - a.avg_change_pct);
  const maxAbs  = Math.max(...sectors.map(s => Math.abs(s.avg_change_pct)), 0.01);

  const allocMap: Record<string, PlayerAllocation> =
    Object.fromEntries(allocation.map(a => [a.sector, a]));

  const scoreColor =
    rotationScore >= 70 ? "#4ade80" :
    rotationScore >= 40 ? "#fbbf24" : "#f87171";

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        Loading sectors…
      </div>
    );
  }

  return (
    <div>
      {/* ── Rotation score header ── */}
      {participantId && (
        <div style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Rotation Score
            </div>
            <div style={{ fontSize: 9, color: "rgba(232,234,240,0.3)", marginTop: 1 }}>
              How well you&apos;re positioned in today&apos;s hot sectors
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: scoreColor }}>
              {rotationScore}
            </div>
            <div style={{ fontSize: 8, color: "rgba(232,234,240,0.35)" }}>/ 100</div>
          </div>
        </div>
      )}

      {/* ── Sector bars ── */}
      <div style={{ padding: "8px 0" }}>
        {sorted.map((sector, idx) => {
          const alloc       = allocMap[sector.name];
          const pct         = sector.avg_change_pct;
          const isUp        = pct >= 0;
          const barWidth    = Math.abs(pct) / maxAbs * 100;
          const isHot       = idx === 0;
          const isCold      = idx === sorted.length - 1;
          const isExpanded  = expanded === sector.name;
          const sectorStocks = stocks.filter(s => SECTOR_MAP[s.symbol] === sector.name);

          return (
            <div key={sector.name}>
              <div
                onClick={() => setExpanded(isExpanded ? null : sector.name)}
                style={{
                  padding: "8px 14px",
                  borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  background: isHot ? "rgba(74,222,128,0.03)" : isCold ? "rgba(248,113,113,0.03)" : "transparent",
                }}
              >
                {/* Name row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{sector.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>
                      {sector.name}
                    </span>
                    {isHot  && <span style={{ fontSize: 8, color: "#4ade80", fontWeight: 800, padding: "1px 4px", background: "rgba(74,222,128,0.1)", borderRadius: 3 }}>HOT</span>}
                    {isCold && <span style={{ fontSize: 8, color: "#f87171", fontWeight: 800, padding: "1px 4px", background: "rgba(248,113,113,0.1)", borderRadius: 3 }}>COLD</span>}
                    <span style={{ fontSize: 9, color: "rgba(232,234,240,0.3)" }}>{sector.stock_count} stocks</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {alloc && (
                      <span style={{ fontSize: 9, color: "#7dd3b0", fontFamily: "monospace" }}>
                        {alloc.pct_of_portfolio.toFixed(0)}% held
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 800, fontFamily: "monospace",
                      color: isUp ? "#4ade80" : "#f87171",
                    }}>
                      {isUp ? "+" : ""}{pct.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Performance bar */}
                <div style={{ position: "relative", height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: isUp ? "50%" : `${50 - barWidth / 2}%`,
                    width: `${barWidth / 2}%`,
                    height: "100%",
                    borderRadius: 99,
                    background: isUp ? "#4ade80" : "#f87171",
                    transition: "width 0.4s ease",
                  }} />
                  {/* Zero line */}
                  <div style={{ position: "absolute", top: 0, left: "50%", width: 1, height: "100%", background: "rgba(255,255,255,0.15)" }} />
                </div>

                {/* Allocation bar (player holdings in this sector) */}
                {alloc && (
                  <div style={{ marginTop: 3, height: 2, borderRadius: 99, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                    <div style={{
                      width: `${alloc.pct_of_portfolio}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: "linear-gradient(90deg, #7dd3b0, #4ade80)",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                )}
              </div>

              {/* Expanded: stock list */}
              {isExpanded && (
                <div style={{ background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {sectorStocks
                    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0))
                    .map(s => {
                      const up = (s.change_percent ?? 0) >= 0;
                      return (
                        <div
                          key={s.symbol}
                          onClick={(e) => { e.stopPropagation(); onSelectSymbol?.(s.symbol); }}
                          style={{ display: "flex", alignItems: "center", padding: "5px 14px 5px 32px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", gap: 8 }}
                        >
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.8)" }}>{s.symbol}</span>
                            <span style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginLeft: 5 }}>${s.price.toFixed(2)}</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#4ade80" : "#f87171", fontFamily: "monospace" }}>
                            {up ? "+" : ""}{(s.change_percent ?? 0).toFixed(2)}%
                          </span>
                          {onSelectSymbol && (
                            <span style={{ fontSize: 9, color: "rgba(125,211,176,0.5)", padding: "1px 6px", background: "rgba(125,211,176,0.06)", borderRadius: 4, border: "1px solid rgba(125,211,176,0.15)" }}>
                              Trade →
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Your sector allocation ── */}
      {allocation.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Your Allocation
          </div>
          {allocation.map(a => {
            const stat = sectors.find(s => s.name === a.sector);
            const isUp = (stat?.avg_change_pct ?? 0) >= 0;
            return (
              <div key={a.sector} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div style={{ fontSize: 11, width: 90, flexShrink: 0, color: "rgba(232,234,240,0.65)" }}>{a.sector}</div>
                <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${a.pct_of_portfolio}%`, height: "100%", borderRadius: 99, background: isUp ? "#4ade80" : "#f87171", transition: "width 0.4s ease" }} />
                </div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.55)", width: 36, textAlign: "right", flexShrink: 0 }}>
                  {a.pct_of_portfolio.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {allocation.length === 0 && participantId && (
        <div style={{ padding: "12px 14px", fontSize: 10, color: "rgba(232,234,240,0.35)", textAlign: "center" }}>
          Buy stocks to see your sector allocation
        </div>
      )}
    </div>
  );
}
