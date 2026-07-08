"use client";

import { useState, useEffect } from "react";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

function StatusPill({ label, open }: { label: string; open: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 99,
      background: open ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${open ? "rgba(74,222,128,0.18)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        background: open ? "#4ade80" : "rgba(232,234,240,0.25)",
        boxShadow: open ? "0 0 5px rgba(74,222,128,0.6)" : "none",
        animation: open ? "pulse-dot 2s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
        color: open ? "rgba(74,222,128,0.85)" : "rgba(232,234,240,0.3)",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </div>
  );
}

export default function MarketStatusBar() {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus());

  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(6,10,20,0.6)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(232,234,240,0.25)", marginRight: 2 }}>
          MARKETS
        </span>
        <StatusPill label={status.nyse.label}   open={status.nyse.open}   />
        <StatusPill label={status.nzx.label}    open={status.nzx.open}    />
        <StatusPill label={status.crypto.label} open={status.crypto.open} />
      </div>
    </>
  );
}
