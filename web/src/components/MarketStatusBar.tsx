"use client";

import { useState, useEffect } from "react";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

export type MarketFilter = "all" | "us" | "lse" | "tse" | "asx" | "nzx" | "crypto";

interface MarketStatusBarProps {
  selected: MarketFilter;
  onSelect: (f: MarketFilter) => void;
}

interface PillProps {
  label:   string;
  open:    boolean;
  active:  boolean;
  onClick: () => void;
}

function StatusPill({ label, open, active, onClick }: PillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
        padding: "3px 9px", borderRadius: 99, cursor: "pointer",
        background: active
          ? (open ? "rgba(74,222,128,0.15)" : "rgba(125,211,176,0.1)")
          : (open ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.03)"),
        border: `1px solid ${
          active
            ? (open ? "rgba(74,222,128,0.45)" : "rgba(125,211,176,0.3)")
            : (open ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)")
        }`,
        outline: "none", transition: "all 0.15s",
        opacity: active ? 1 : 0.6,
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        background: open ? "#4ade80" : "rgba(232,234,240,0.25)",
        boxShadow: open && active ? "0 0 6px rgba(74,222,128,0.7)" : "none",
        animation: open ? "pulse-dot 2s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap",
        color: active
          ? (open ? "rgba(74,222,128,0.95)" : "rgba(232,234,240,0.75)")
          : (open ? "rgba(74,222,128,0.6)"  : "rgba(232,234,240,0.3)"),
      }}>
        {label}
      </span>
    </button>
  );
}

export default function MarketStatusBar({ selected, onSelect }: MarketStatusBarProps) {
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
        .market-bar::-webkit-scrollbar { display: none; }
        .market-bar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="market-bar"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(6,10,20,0.6)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {/* ALL */}
        <button
          onClick={() => onSelect("all")}
          style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", flexShrink: 0,
            padding: "3px 9px", borderRadius: 99, cursor: "pointer",
            background: selected === "all" ? "rgba(125,211,176,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${selected === "all" ? "rgba(125,211,176,0.35)" : "rgba(255,255,255,0.08)"}`,
            color: selected === "all" ? "#7dd3b0" : "rgba(232,234,240,0.35)",
            outline: "none", transition: "all 0.15s",
          }}
        >
          ALL
        </button>

        <StatusPill label={status.nyse.label}   open={status.nyse.open}   active={selected === "us"}     onClick={() => onSelect("us")}     />
        <StatusPill label={status.lse.label}    open={status.lse.open}    active={selected === "lse"}    onClick={() => onSelect("lse")}    />
        <StatusPill label={status.tse.label}    open={status.tse.open}    active={selected === "tse"}    onClick={() => onSelect("tse")}    />
        <StatusPill label={status.asx.label}    open={status.asx.open}    active={selected === "asx"}    onClick={() => onSelect("asx")}    />
        <StatusPill label={status.nzx.label}    open={status.nzx.open}    active={selected === "nzx"}    onClick={() => onSelect("nzx")}    />
        <StatusPill label={status.crypto.label} open={status.crypto.open} active={selected === "crypto"} onClick={() => onSelect("crypto")} />
      </div>
    </>
  );
}
