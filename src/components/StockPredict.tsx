"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { AI_LIMITS } from "@/lib/aiLimits";

interface PredictResult {
  symbol: string;
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  timeframe: string;
  targetLow: number;
  targetHigh: number;
  signals: string[];
  summary: string;
  generatedAt: string;
}

interface StockPredictProps {
  symbol: string;
  currentPrice: number;
  onClose: () => void;
}

const DIRECTION_CONFIG = {
  UP:      { icon: "↑", label: "Bullish", color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.2)",  glow: "rgba(74,222,128,0.15)" },
  DOWN:    { icon: "↓", label: "Bearish", color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)", glow: "rgba(248,113,113,0.15)" },
  NEUTRAL: { icon: "→", label: "Neutral", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.2)",  glow: "rgba(251,191,36,0.15)" },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH:   "#4ade80",
  MEDIUM: "#fbbf24",
  LOW:    "#f87171",
};

const CONFIDENCE_DOTS: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export default function StockPredict({ symbol, currentPrice, onClose }: StockPredictProps) {
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dotCount, setDotCount] = useState(1);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function runPrediction() {
    setLoading(true);
    setError(null);
    setResult(null);
    let d = 1;
    const interval = setInterval(() => { setDotCount((d++ % 3) + 1); }, 450);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/predict?symbol=${symbol}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Prediction failed");
      if (json.remaining !== undefined) setRemaining(json.remaining);
      setResult(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }

  // Start prediction on mount
  useState(() => { runPrediction(); });

  const cfg = result ? DIRECTION_CONFIG[result.direction] : null;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      background: "rgba(6,10,20,0.92)", backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(232,234,240,0.9)", letterSpacing: "-0.01em" }}>{symbol}</div>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(125,211,176,0.1)", border: "1px solid rgba(125,211,176,0.2)", color: "#7dd3b0", fontWeight: 700 }}>
            AI Prediction
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(232,234,240,0.52)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 20 }}>
            <div style={{ fontSize: 28, filter: "drop-shadow(0 0 12px rgba(125,211,176,0.4))", animation: "pulse 1.6s ease-in-out infinite" }}>
              📊
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(232,234,240,0.65)" }}>
                Analysing {symbol}{"...".slice(0, dotCount)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", marginTop: 5, lineHeight: 1.5 }}>
                Reading intraday price history<br />Computing SMA, RSI, Bollinger Bands
              </div>
            </div>
            <div style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, height: "100%", background: "linear-gradient(90deg,transparent,#7dd3b0,transparent)", width: "40%", animation: "scan 1.6s ease-in-out infinite" }} />
            </div>
            <style>{`@keyframes scan { 0%{left:-40%} 100%{left:140%} } @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }`}</style>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>Prediction failed</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.58)", lineHeight: 1.5 }}>{error}</div>
            </div>
            <button onClick={runPrediction} style={{ padding: "9px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,234,240,0.65)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              ↻ Try again
            </button>
          </div>
        )}

        {/* Result */}
        {result && cfg && !loading && (
          <>
            {/* Direction hero */}
            <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 14, padding: "16px 14px", display: "flex", alignItems: "center", gap: 14, boxShadow: `0 0 24px ${cfg.glow}` }}>
              {/* Big arrow */}
              <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg,${cfg.glow},transparent)`, border: `2px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 30, color: cfg.color, lineHeight: 1, fontWeight: 900 }}>{cfg.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: cfg.color, letterSpacing: "-0.02em", lineHeight: 1 }}>{cfg.label}</div>
                <div style={{ fontSize: 11, color: "rgba(232,234,240,0.58)", marginTop: 4 }}>{result.timeframe} outlook</div>
                {/* Confidence dots */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[1, 2, 3].map(n => (
                      <div key={n} style={{ width: 8, height: 8, borderRadius: 2, background: n <= CONFIDENCE_DOTS[result.confidence] ? CONFIDENCE_COLOR[result.confidence] : "rgba(255,255,255,0.08)" }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: CONFIDENCE_COLOR[result.confidence], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {result.confidence} confidence
                  </span>
                </div>
              </div>
            </div>

            {/* Price target */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Price target range · {result.timeframe}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginBottom: 2 }}>Low</div>
                  <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: "#f87171" }}>${result.targetLow.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: "rgba(248,113,113,0.5)", marginTop: 1 }}>
                    {(((result.targetLow - currentPrice) / currentPrice) * 100).toFixed(1)}%
                  </div>
                </div>
                {/* Range bar */}
                <div style={{ flex: 1, position: "relative", height: 28, display: "flex", alignItems: "center" }}>
                  <div style={{ width: "100%", height: 4, background: "linear-gradient(90deg,#f87171,rgba(255,255,255,0.08),#4ade80)", borderRadius: 2 }} />
                  {/* Current price marker */}
                  {(() => {
                    const range = result.targetHigh - result.targetLow;
                    const pct = range > 0 ? Math.max(0, Math.min(100, ((currentPrice - result.targetLow) / range) * 100)) : 50;
                    return (
                      <div style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ width: 2, height: 10, background: "#7dd3b0", borderRadius: 1, marginTop: -3 }} />
                        <div style={{ fontSize: 8, color: "#7dd3b0", fontWeight: 700, whiteSpace: "nowrap" }}>now</div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginBottom: 2 }}>High</div>
                  <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: "#4ade80" }}>${result.targetHigh.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: "rgba(74,222,128,0.5)", marginTop: 1 }}>
                    +{(((result.targetHigh - currentPrice) / currentPrice) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Technical signals */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Key signals</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.signals.map((sig, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: cfg.color, marginTop: 5, flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", lineHeight: 1.5 }}>{sig}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: "rgba(125,211,176,0.03)", border: "1px solid rgba(125,211,176,0.1)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#7dd3b0", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Analysis</div>
              <p style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", lineHeight: 1.65, margin: 0 }}>{result.summary}</p>
            </div>

            {/* Re-run + disclaimer */}
            <button onClick={runPrediction} disabled={remaining === 0}
              style={{ width: "100%", padding: "9px", borderRadius: 9,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                color: remaining === 0 ? "rgba(232,234,240,0.2)" : "rgba(232,234,240,0.52)",
                fontSize: 11, fontWeight: 600, cursor: remaining === 0 ? "not-allowed" : "pointer" }}>
              ↻ Re-run prediction
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <p style={{ margin: 0, fontSize: 9, color: "rgba(232,234,240,0.60)", lineHeight: 1.5, flex: 1 }}>
                Technical analysis only · Not financial advice
              </p>
              {remaining !== null && (
                <span style={{ fontSize: 9, color: remaining === 0 ? "#f87171" : "rgba(232,234,240,0.60)", fontFamily: "monospace", flexShrink: 0, marginLeft: 8 }}>
                  {remaining}/{AI_LIMITS.predict} left today
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
