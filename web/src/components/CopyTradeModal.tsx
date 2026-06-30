"use client";

import { useState } from "react";
import { executeTrade, formatCurrency } from "@/lib/stockApi";

interface CopyTradeModalProps {
  symbol:      string;
  action:      "buy" | "sell";
  origShares:  number;
  currentPrice: number;
  participant: {
    id:           string;
    cash_balance: number;
  };
  currentHolding: number; // shares currently held for this symbol
  onClose:   () => void;
  onSuccess: () => void;
}

export default function CopyTradeModal({
  symbol,
  action,
  origShares,
  currentPrice,
  participant,
  currentHolding,
  onClose,
  onSuccess,
}: CopyTradeModalProps) {
  // Cap shares to what the player can actually do
  const maxBuyable  = Math.floor(participant.cash_balance / currentPrice);
  const maxSellable = currentHolding;

  const defaultShares = action === "buy"
    ? Math.min(origShares, maxBuyable)
    : Math.min(origShares, maxSellable);

  const [shares,  setShares]  = useState(defaultShares);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState(false);

  const isBuy    = action === "buy";
  const maxAllowed = isBuy ? maxBuyable : maxSellable;
  const total    = shares * currentPrice;
  const canExecute = shares > 0 && shares <= maxAllowed;

  async function handleConfirm() {
    if (!canExecute) return;
    setLoading(true);
    setError(null);
    try {
      await executeTrade({
        participantId:      participant.id,
        symbol,
        companyName:        symbol,
        action,
        shares,
        price:              currentPrice,
        currentCashBalance: participant.cash_balance,
        currentShares:      currentHolding,
      });
      setDone(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setLoading(false);
    }
  }

  const accentColor  = isBuy ? "#4ade80" : "#f87171";
  const accentBg     = isBuy ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";
  const accentBorder = isBuy ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(6,10,20,0.75)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position:  "fixed",
        top:       "50%",
        left:      "50%",
        transform: "translate(-50%, -50%)",
        width:     "min(360px, calc(100vw - 32px))",
        background: "#0d1321",
        border:    "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        zIndex:    1001,
        overflow:  "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
              color: accentColor, background: accentBg,
              border: `1px solid ${accentBorder}`,
              padding: "2px 7px", borderRadius: 4,
            }}>
              {isBuy ? "BUY" : "SELL"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Copy Trade</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(232,234,240,0.45)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "18px" }}>

          {done ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7dd3b0" }}>Trade executed!</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.45)", marginTop: 4 }}>
                {isBuy ? "Bought" : "Sold"} {shares} shares of {symbol}
              </div>
            </div>
          ) : (
            <>
              {/* Symbol + Price */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "12px 14px", marginBottom: 14,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "rgba(232,234,240,0.95)" }}>{symbol}</div>
                  <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 2 }}>
                    Original: {origShares} sh
                    {origShares !== defaultShares && (
                      <span style={{ color: "#fbbf24", marginLeft: 4 }}>
                        → capped at {defaultShares}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "rgba(232,234,240,0.85)" }}>
                    {formatCurrency(currentPrice)}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)" }}>current price</div>
                </div>
              </div>

              {/* Shares input */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
                }}>
                  Shares ({isBuy ? `max ${maxBuyable}` : `you own ${maxSellable}`})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 5, 10].map(n => (
                    n <= maxAllowed && (
                      <button key={n} onClick={() => setShares(Math.min(n, maxAllowed))}
                        style={{
                          flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 700,
                          borderRadius: 7, cursor: "pointer",
                          border: shares === n ? `1px solid ${accentBorder}` : "1px solid rgba(255,255,255,0.08)",
                          background: shares === n ? accentBg : "rgba(255,255,255,0.03)",
                          color: shares === n ? accentColor : "rgba(232,234,240,0.6)",
                        }}
                      >{n}</button>
                    )
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={maxAllowed}
                    value={shares}
                    onChange={e => setShares(Math.max(1, Math.min(parseInt(e.target.value) || 1, maxAllowed)))}
                    style={{
                      flex: 1.5, padding: "7px 8px", fontSize: 12, fontWeight: 700,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 7, color: "#e8eaf0", textAlign: "center",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Cost summary */}
              <div style={{
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                borderRadius: 10, padding: "10px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 14,
              }}>
                <span style={{ fontSize: 11, color: "rgba(232,234,240,0.6)" }}>
                  {shares} sh × {formatCurrency(currentPrice)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: accentColor }}>
                  {isBuy ? "−" : "+"}{formatCurrency(total)}
                </span>
              </div>

              {/* Affordability warning */}
              {maxAllowed === 0 && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.2)",
                  fontSize: 11, color: "#fbbf24",
                }}>
                  {isBuy ? "Not enough cash to copy this trade." : "You don't hold any shares of " + symbol + "."}
                </div>
              )}

              {error && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  fontSize: 11, color: "#f87171",
                }}>
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose} style={{
                  flex: 1, padding: "10px", fontSize: 12, fontWeight: 600,
                  borderRadius: 8, cursor: "pointer",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(232,234,240,0.6)",
                }}>Cancel</button>
                <button
                  onClick={handleConfirm}
                  disabled={!canExecute || loading}
                  style={{
                    flex: 2, padding: "10px", fontSize: 12, fontWeight: 700,
                    borderRadius: 8, cursor: canExecute && !loading ? "pointer" : "not-allowed",
                    background: canExecute ? accentBg : "rgba(255,255,255,0.03)",
                    border: `1px solid ${canExecute ? accentBorder : "rgba(255,255,255,0.06)"}`,
                    color: canExecute ? accentColor : "rgba(232,234,240,0.3)",
                    transition: "all 0.15s",
                  }}
                >
                  {loading ? "Executing…" : `Confirm ${isBuy ? "Buy" : "Sell"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
