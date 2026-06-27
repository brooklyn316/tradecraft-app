"use client";

import { useEffect } from "react";

export interface ToastItem {
  id: string;
  symbol: string;
  condition: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div style={{ position: "fixed", top: 64, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isAbove = toast.condition === "above";

  return (
    <div style={{
      pointerEvents: "all",
      minWidth: 260,
      background: "#0d1220",
      border: `1px solid ${isAbove ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
      borderRadius: 12,
      padding: "12px 14px",
      boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${isAbove ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)"}`,
      animation: "slideInRight 0.25s ease-out",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>

      {/* Icon */}
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        background: isAbove ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)" }}>
        🔔
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.9)", marginBottom: 2 }}>
          Price Alert: {toast.symbol}
        </div>
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.65)", lineHeight: 1.4 }}>
          {toast.symbol} crossed {isAbove ? "above" : "below"} ${toast.targetPrice.toFixed(2)}<br />
          Now trading at <span style={{ color: isAbove ? "#4ade80" : "#f87171", fontFamily: "monospace", fontWeight: 600 }}>${toast.currentPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Dismiss */}
      <button onClick={() => onDismiss(toast.id)}
        style={{ background: "none", border: "none", color: "rgba(232,234,240,0.5)", fontSize: 16, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1 }}>
        ×
      </button>
    </div>
  );
}
