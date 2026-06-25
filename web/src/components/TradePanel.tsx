"use client";

import { useState } from "react";
import type { StockPrice, CompetitionParticipant, Holding } from "@/types";
import { executeTrade, formatCurrency } from "@/lib/stockApi";

interface TradePanelProps {
  stock: StockPrice;
  participant: CompetitionParticipant;
  holding: Holding | null;
  onTradeComplete: () => void;
}

type Mode = "market" | "limit";

export default function TradePanel({ stock, participant, holding, onTradeComplete }: TradePanelProps) {
  const [mode, setMode] = useState<Mode>("market");
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [sharesInput, setSharesInput] = useState("");
  const [limitPriceInput, setLimitPriceInput] = useState(stock.price.toFixed(2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const shares = parseFloat(sharesInput) || 0;
  const limitPrice = parseFloat(limitPriceInput) || stock.price;
  const price = mode === "market" ? stock.price : limitPrice;
  const total = shares * price;

  const canAfford  = total <= participant.cash_balance;
  const hasShares  = holding && holding.shares >= shares;
  const isValid    = shares > 0 && (action === "buy" ? canAfford : !!hasShares) && (mode === "limit" ? limitPrice > 0 : true);
  const maxBuyShares  = Math.floor(participant.cash_balance / price);
  const maxSellShares = holding ? Math.floor(holding.shares) : 0;
  const isPositive    = (stock.change_percent ?? 0) >= 0;
  const cashPercent   = Math.min(100, (total / participant.cash_balance) * 100);

  function reset() { setSharesInput(""); setError(null); setSuccess(null); }

  async function handleMarketTrade() {
    if (!isValid) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await executeTrade({
        participantId: participant.id, symbol: stock.symbol,
        companyName: stock.company_name ?? stock.symbol,
        action, shares, price: stock.price,
        currentCashBalance: participant.cash_balance,
        currentShares: holding?.shares ?? 0,
      });
      setSuccess(`${action === "buy" ? "Bought" : "Sold"} ${shares} × ${stock.symbol} @ $${stock.price.toFixed(2)}`);
      setSharesInput(""); onTradeComplete();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function handleLimitOrder() {
    if (!isValid) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/limit-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          symbol: stock.symbol,
          companyName: stock.company_name ?? stock.symbol,
          action, shares,
          targetPrice: limitPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to place order");
      setSuccess(`Limit order placed: ${action === "buy" ? "Buy" : "Sell"} ${shares} × ${stock.symbol} @ $${limitPrice.toFixed(2)}`);
      setSharesInput(""); onTradeComplete();
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  function setPercent(pct: number) {
    if (action === "buy") setSharesInput(Math.floor((participant.cash_balance * pct) / price).toString());
    else setSharesInput(Math.floor(maxSellShares * pct).toString());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Stock header */}
      <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>{stock.symbol}</div>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.45)", marginTop: 2 }}>{stock.company_name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "white", fontFamily: "monospace" }}>${stock.price.toFixed(2)}</div>
            <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600, marginTop: 2, color: isPositive ? "#4ade80" : "#f87171" }}>
              {isPositive ? "▲" : "▼"} {Math.abs(stock.change_percent ?? 0).toFixed(2)}%
            </div>
          </div>
        </div>
        {stock.low && stock.high && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(232,234,240,0.58)", marginBottom: 6, fontFamily: "monospace" }}>
              <span>L ${stock.low.toFixed(2)}</span>
              <span style={{ color: "rgba(232,234,240,0.45)" }}>Day Range</span>
              <span>H ${stock.high.toFixed(2)}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
              {(() => { const r = stock.high - stock.low; const p = r > 0 ? ((stock.price - stock.low) / r) * 100 : 50;
                return <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: "white", border: "2px solid #7dd3b0", left: `calc(${p}% - 5px)` }} />; })()}
            </div>
          </div>
        )}
      </div>

      {/* Holding badge */}
      {holding && (
        <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "rgba(125,211,176,0.07)", border: "1px solid rgba(125,211,176,0.18)", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#7dd3b0", fontWeight: 600 }}>You own {holding.shares.toFixed(0)} shares</span>
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.4)" }}>avg ${holding.avg_cost.toFixed(2)}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, flex: 1, overflowY: "auto" }}>

        {/* Market / Limit toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["market", "limit"] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); reset(); }}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s", textTransform: "uppercase", letterSpacing: "0.05em",
                background: mode === m ? "rgba(255,255,255,0.07)" : "transparent",
                color: mode === m ? "rgba(232,234,240,0.9)" : "rgba(232,234,240,0.52)" }}>
              {m === "market" ? "Market" : "Limit"}
            </button>
          ))}
        </div>

        {/* Limit mode info banner */}
        {mode === "limit" && (
          <div style={{ padding: "8px 12px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 9, fontSize: 11, color: "rgba(251,191,36,0.7)", lineHeight: 1.5 }}>
            Set your target price. The order fills automatically when the market hits it.
          </div>
        )}

        {/* Buy / Sell toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["buy", "sell"] as const).map(a => (
            <button key={a} onClick={() => { setAction(a); reset(); }}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s",
                background: action === a ? (a === "buy" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)") : "transparent",
                color: action === a ? (a === "buy" ? "#4ade80" : "#f87171") : "rgba(232,234,240,0.52)",
                boxShadow: action === a ? `inset 0 0 0 1px ${a === "buy" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}` : "none" }}>
              {a === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        {/* Limit price input */}
        {mode === "limit" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {action === "buy" ? "Buy when price ≤" : "Sell when price ≥"}
              </label>
              <button onClick={() => setLimitPriceInput(stock.price.toFixed(2))}
                style={{ fontSize: 10, color: "#7dd3b0", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                Use current
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "rgba(232,234,240,0.4)", fontFamily: "monospace" }}>$</span>
              <input type="number" value={limitPriceInput} onChange={e => { setLimitPriceInput(e.target.value); reset(); }}
                step="0.01" min="0.01"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 12, padding: "12px 16px 12px 28px", fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#fbbf24", outline: "none", boxSizing: "border-box" }} />
            </div>
            {limitPrice > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: "rgba(232,234,240,0.5)", fontFamily: "monospace" }}>
                {action === "buy"
                  ? `${limitPrice < stock.price ? `↓ ${(((stock.price - limitPrice) / stock.price) * 100).toFixed(1)}% below current` : `↑ ${(((limitPrice - stock.price) / stock.price) * 100).toFixed(1)}% above current — triggers immediately`}`
                  : `${limitPrice > stock.price ? `↑ ${(((limitPrice - stock.price) / stock.price) * 100).toFixed(1)}% above current` : `↓ ${(((stock.price - limitPrice) / stock.price) * 100).toFixed(1)}% below current — triggers immediately`}`}
              </div>
            )}
          </div>
        )}

        {/* Shares input */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Shares</label>
            <span style={{ fontSize: 12, color: "rgba(232,234,240,0.52)", fontFamily: "monospace" }}>Max: {action === "buy" ? maxBuyShares : maxSellShares}</span>
          </div>
          <input type="number" value={sharesInput} onChange={e => { setSharesInput(e.target.value); setError(null); setSuccess(null); }}
            placeholder="0" min="0" step="1"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "12px 16px", fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "white", outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {[["25%", 0.25], ["50%", 0.5], ["75%", 0.75], ["Max", 1]].map(([label, pct]) => (
              <button key={label as string} onClick={() => setPercent(pct as number)}
                style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, color: "rgba(232,234,240,0.4)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer" }}>
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {/* Order summary */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px" }}>
            {[
              ["Shares", String(shares || "—")],
              [mode === "limit" ? "Limit price" : "Price per share", `$${price.toFixed(2)}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "rgba(232,234,240,0.4)" }}>{k}</span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: mode === "limit" && k === "Limit price" ? "#fbbf24" : "rgba(232,234,240,0.7)" }}>{v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0 10px" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(232,234,240,0.5)" }}>Est. Total</span>
              <span style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700, color: shares > 0 ? "white" : "rgba(232,234,240,0.45)" }}>
                {shares > 0 ? formatCurrency(total) : "—"}
              </span>
            </div>
          </div>
          {action === "buy" && shares > 0 && (
            <div style={{ padding: "0 16px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(232,234,240,0.52)", marginBottom: 6, fontFamily: "monospace" }}>
                <span>{cashPercent.toFixed(1)}% of cash</span>
                <span>{formatCurrency(participant.cash_balance)} available</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${cashPercent}%`, background: cashPercent > 80 ? "#f87171" : "#4ade80", opacity: 0.7, borderRadius: 2 }} />
              </div>
            </div>
          )}
          {action === "sell" && (
            <div style={{ padding: "0 16px 14px", fontSize: 12, color: "rgba(232,234,240,0.52)", fontFamily: "monospace" }}>
              {maxSellShares > 0 ? `${maxSellShares} shares available` : "No shares to sell"}
            </div>
          )}
        </div>

        {error   && <div style={{ fontSize: 13, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "12px 14px" }}>⚠ {error}</div>}
        {success && <div style={{ fontSize: 13, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "12px 14px" }}>✓ {success}</div>}

        <button
          onClick={mode === "market" ? handleMarketTrade : handleLimitOrder}
          disabled={!isValid || loading}
          style={{ width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: isValid && !loading ? "pointer" : "not-allowed", opacity: isValid && !loading ? 1 : 0.35,
            border: "none", marginTop: "auto",
            background: mode === "limit"
              ? "rgba(251,191,36,0.1)"
              : action === "buy" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
            color: mode === "limit" ? "#fbbf24" : action === "buy" ? "#4ade80" : "#f87171",
            boxShadow: `inset 0 0 0 1px ${mode === "limit" ? "rgba(251,191,36,0.3)" : action === "buy" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}` }}>
          {loading ? "Processing…" : mode === "limit"
            ? `Place Limit Order · ${shares > 0 ? `${shares} × $${limitPrice.toFixed(2)}` : stock.symbol}`
            : `${action === "buy" ? "Buy" : "Sell"} ${shares > 0 ? `${shares} × ` : ""}${stock.symbol}${shares > 0 ? ` · ${formatCurrency(total)}` : ""}`}
        </button>
      </div>
    </div>
  );
}
