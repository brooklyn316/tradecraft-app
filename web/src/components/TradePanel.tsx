"use client";

import { useState } from "react";
import type { StockPrice, CompetitionParticipant, Holding, ShortPosition } from "@/types";
import { executeTrade, formatCurrency } from "@/lib/stockApi";

interface TradePanelProps {
  stock: StockPrice;
  participant: CompetitionParticipant;
  holding: Holding | null;
  shortPosition: ShortPosition | null;
  marginLimit?: number;
  onTradeComplete: () => void;
}

type Mode = "market" | "limit";

export default function TradePanel({ stock, participant, holding, shortPosition, marginLimit = 0, onTradeComplete }: TradePanelProps) {
  const [mode, setMode] = useState<Mode>("market");
  const [action, setAction] = useState<"buy" | "sell" | "short" | "cover">("buy");
  const [useMargin, setUseMargin] = useState(false);
  const [sharesInput, setSharesInput] = useState("");
  const [limitPriceInput, setLimitPriceInput] = useState(stock.price.toFixed(2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isShortAction = action === "short" || action === "cover";
  const shares = parseFloat(sharesInput) || 0;
  const limitPrice = parseFloat(limitPriceInput) || stock.price;
  const price = mode === "market" ? stock.price : limitPrice;
  const total = shares * price;

  // Margin: how much more they can borrow (current borrowed = abs(cash) if negative)
  const currentBorrowed   = participant.cash_balance < 0 ? Math.abs(participant.cash_balance) : 0;
  const remainingMargin   = Math.max(0, marginLimit - currentBorrowed);
  const effectiveBuyPower = participant.cash_balance + (useMargin ? remainingMargin : 0);
  const marginUsedOnTrade = useMargin && total > participant.cash_balance
    ? Math.min(total - participant.cash_balance, remainingMargin)
    : 0;

  const canAfford      = total <= effectiveBuyPower;
  const hasShares      = holding && holding.shares >= shares;
  const hasShortShares = shortPosition && shortPosition.shares >= shares;
  const isValid =
    shares > 0 &&
    (action === "buy"    ? canAfford :
     action === "sell"   ? !!hasShares :
     action === "short"  ? total <= participant.cash_balance :
     action === "cover"  ? !!hasShortShares : false) &&
    (mode === "limit" ? limitPrice > 0 : true);

  const maxBuyShares   = Math.floor(effectiveBuyPower / price);
  const maxSellShares  = holding ? Math.floor(holding.shares) : 0;
  const maxShortShares = Math.floor(participant.cash_balance / price);
  const maxCoverShares = shortPosition ? Math.floor(shortPosition.shares) : 0;
  const isPositive     = (stock.change_percent ?? 0) >= 0;
  const cashPercent    = Math.min(100, (total / participant.cash_balance) * 100);

  // Short P&L preview
  const shortPnl = shortPosition
    ? (shortPosition.short_price - stock.price) * shortPosition.shares
    : 0;
  const shortPnlPct = shortPosition
    ? ((shortPosition.short_price - stock.price) / shortPosition.short_price) * 100
    : 0;

  function reset() { setSharesInput(""); setError(null); setSuccess(null); }

  async function handleMarketTrade() {
    if (!isValid) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      if (action === "short" || action === "cover") {
        const res = await fetch("/api/short", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            participantId: participant.id,
            symbol: stock.symbol,
            companyName: stock.company_name ?? stock.symbol,
            shares,
            currentPrice: stock.price,
            currentCashBalance: participant.cash_balance,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");
        const pnlStr = action === "cover" && data.pnl !== undefined
          ? ` · P&L: ${data.pnl >= 0 ? "+" : ""}$${data.pnl.toFixed(2)}`
          : "";
        setSuccess(`${action === "short" ? "Shorted" : "Covered"} ${shares} × ${stock.symbol} @ $${stock.price.toFixed(2)}${pnlStr}`);
      } else if (action === "buy" && useMargin && total > participant.cash_balance) {
        // Margin buy
        const res = await fetch("/api/margin-buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: participant.id,
            symbol: stock.symbol,
            companyName: stock.company_name ?? stock.symbol,
            shares,
            price: stock.price,
            currentCashBalance: participant.cash_balance,
            marginLimit,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Margin buy failed");
        setSuccess(`Bought ${shares} × ${stock.symbol} @ $${stock.price.toFixed(2)} · $${data.borrowed.toFixed(0)} on margin`);
      } else {
        await executeTrade({
          participantId: participant.id, symbol: stock.symbol,
          companyName: stock.company_name ?? stock.symbol,
          action, shares, price: stock.price,
          currentCashBalance: participant.cash_balance,
          currentShares: holding?.shares ?? 0,
        });
        setSuccess(`${action === "buy" ? "Bought" : "Sold"} ${shares} × ${stock.symbol} @ $${stock.price.toFixed(2)}`);
      }
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
    if (action === "buy")   setSharesInput(Math.floor((effectiveBuyPower * pct) / price).toString());
    else if (action === "sell")  setSharesInput(Math.floor(maxSellShares * pct).toString());
    else if (action === "short") setSharesInput(Math.floor((participant.cash_balance * pct) / price).toString());
    else if (action === "cover") setSharesInput(Math.floor(maxCoverShares * pct).toString());
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

      {/* Long holding badge */}
      {holding && (() => {
        const heldMs   = holding.first_bought_at ? Date.now() - new Date(holding.first_bought_at).getTime() : 0;
        const heldDays = Math.floor(heldMs / 86400000);
        const heldHrs  = Math.floor((heldMs % 86400000) / 3600000);
        const heldLabel = heldDays >= 1 ? `${heldDays}d ${heldHrs}h` : heldHrs >= 1 ? `${heldHrs}h` : "< 1h";
        const boughtDate = holding.first_bought_at
          ? new Date(holding.first_bought_at).toLocaleDateString([], { month: "short", day: "numeric" })
          : null;
        return (
          <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "rgba(125,211,176,0.07)", border: "1px solid rgba(125,211,176,0.18)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#7dd3b0", fontWeight: 600 }}>You own {holding.shares.toFixed(0)} shares</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.4)" }}>avg ${holding.avg_cost.toFixed(2)}</span>
            </div>
            {boughtDate && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>⏱ Held {heldLabel}</span>
                <span style={{ fontSize: 10, color: "rgba(232,234,240,0.3)" }}>· since {boughtDate}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Short position badge */}
      {shortPosition && (
        <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>SHORT {shortPosition.shares.toFixed(0)} shares</span>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.4)" }}>@ ${shortPosition.short_price.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(232,234,240,0.45)" }}>Unrealised P&L</span>
            <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: shortPnl >= 0 ? "#4ade80" : "#f87171" }}>
              {shortPnl >= 0 ? "+" : ""}${shortPnl.toFixed(2)} ({shortPnlPct >= 0 ? "+" : ""}{shortPnlPct.toFixed(1)}%)
            </span>
          </div>
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

        {/* Buy / Sell / Short / Cover toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.07)", gap: 2 }}>
          {([
            { key: "buy",   label: "Buy",   activeColor: "#4ade80", activeBg: "rgba(74,222,128,0.12)",   activeBorder: "rgba(74,222,128,0.25)" },
            { key: "sell",  label: "Sell",  activeColor: "#f87171", activeBg: "rgba(248,113,113,0.12)",  activeBorder: "rgba(248,113,113,0.25)" },
            { key: "short", label: "Short", activeColor: "#f97316", activeBg: "rgba(249,115,22,0.12)",   activeBorder: "rgba(249,115,22,0.25)" },
            { key: "cover", label: "Cover", activeColor: "#a78bfa", activeBg: "rgba(167,139,250,0.12)",  activeBorder: "rgba(167,139,250,0.25)" },
          ] as const).map(({ key, label, activeColor, activeBg, activeBorder }) => (
            <button key={key} onClick={() => { setAction(key); reset(); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s",
                background: action === key ? activeBg : "transparent",
                color: action === key ? activeColor : "rgba(232,234,240,0.4)",
                boxShadow: action === key ? `inset 0 0 0 1px ${activeBorder}` : "none" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Margin toggle — only on Buy */}
        {action === "buy" && marginLimit > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px",
            background: useMargin ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${useMargin ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 9, cursor: "pointer" }}
            onClick={() => setUseMargin(m => !m)}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: useMargin ? "#fbbf24" : "rgba(232,234,240,0.6)" }}>
                ⚡ Use Margin
              </div>
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 1 }}>
                {useMargin
                  ? `$${remainingMargin.toFixed(0)} borrowing power · 0.05% interest/tick`
                  : `2× leverage available · $${remainingMargin.toFixed(0)} remaining`}
              </div>
            </div>
            <div style={{ width: 36, height: 20, borderRadius: 10, background: useMargin ? "#fbbf24" : "rgba(255,255,255,0.1)", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: useMargin ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
            </div>
          </div>
        )}

        {/* Margin call warning */}
        {currentBorrowed > 0 && (
          <div style={{ padding: "7px 11px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: 8, fontSize: 10, color: "rgba(251,191,36,0.75)", lineHeight: 1.5 }}>
            ⚠ ${currentBorrowed.toFixed(0)} on margin · Interest charged each tick · Margin call triggers at 120% debt ratio
          </div>
        )}

        {/* Short mode explainer */}
        {action === "short" && (
          <div style={{ padding: "8px 12px", background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)", borderRadius: 9, fontSize: 11, color: "rgba(249,115,22,0.8)", lineHeight: 1.5 }}>
            Borrow &amp; sell shares now. Profit if the price falls. Collateral = full position value, locked from your cash.
          </div>
        )}
        {action === "cover" && !shortPosition && (
          <div style={{ padding: "8px 12px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 9, fontSize: 11, color: "rgba(167,139,250,0.7)", lineHeight: 1.5 }}>
            No open short position on {stock.symbol}.
          </div>
        )}

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
            <span style={{ fontSize: 12, color: "rgba(232,234,240,0.52)", fontFamily: "monospace" }}>Max: {
              action === "buy" ? maxBuyShares :
              action === "sell" ? maxSellShares :
              action === "short" ? maxShortShares :
              maxCoverShares
            }</span>
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
              {useMargin && marginUsedOnTrade > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, color: "rgba(251,191,36,0.75)", fontFamily: "monospace" }}>
                  ⚡ ${marginUsedOnTrade.toFixed(0)} borrowed on margin · interest 0.05%/tick
                </div>
              )}
            </div>
          )}
          {action === "sell" && (
            <div style={{ padding: "0 16px 14px", fontSize: 12, color: "rgba(232,234,240,0.52)", fontFamily: "monospace" }}>
              {maxSellShares > 0 ? `${maxSellShares} shares available` : "No shares to sell"}
            </div>
          )}
          {action === "short" && shares > 0 && (
            <div style={{ padding: "0 16px 14px", fontSize: 11, color: "rgba(249,115,22,0.7)", fontFamily: "monospace" }}>
              Collateral locked: {formatCurrency(total)} · Profit if price drops
            </div>
          )}
          {action === "cover" && shortPosition && (
            <div style={{ padding: "0 16px 14px", fontSize: 11, color: "rgba(167,139,250,0.7)", fontFamily: "monospace" }}>
              {maxCoverShares} shares to cover · Est. P&L: {shortPnl >= 0 ? "+" : ""}${((shortPosition.short_price - stock.price) * shares).toFixed(2)}
            </div>
          )}
        </div>

        {error   && <div style={{ fontSize: 13, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "12px 14px" }}>⚠ {error}</div>}
        {success && <div style={{ fontSize: 13, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "12px 14px" }}>✓ {success}</div>}

        <button
          onClick={mode === "market" ? handleMarketTrade : handleLimitOrder}
          disabled={!isValid || loading || (action === "cover" && !shortPosition)}
          style={{ width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: isValid && !loading ? "pointer" : "not-allowed", opacity: isValid && !loading ? 1 : 0.35,
            border: "none", marginTop: "auto",
            background: mode === "limit" ? "rgba(251,191,36,0.1)" :
              action === "buy"   ? "rgba(74,222,128,0.12)"  :
              action === "sell"  ? "rgba(248,113,113,0.12)" :
              action === "short" ? "rgba(249,115,22,0.12)"  :
              "rgba(167,139,250,0.12)",
            color: mode === "limit" ? "#fbbf24" :
              action === "buy"   ? "#4ade80"  :
              action === "sell"  ? "#f87171"  :
              action === "short" ? "#f97316"  :
              "#a78bfa",
            boxShadow: `inset 0 0 0 1px ${
              mode === "limit" ? "rgba(251,191,36,0.3)" :
              action === "buy"   ? "rgba(74,222,128,0.3)"  :
              action === "sell"  ? "rgba(248,113,113,0.3)" :
              action === "short" ? "rgba(249,115,22,0.3)"  :
              "rgba(167,139,250,0.3)"
            }` }}>
          {loading ? "Processing…" : mode === "limit"
            ? `Place Limit Order · ${shares > 0 ? `${shares} × $${limitPrice.toFixed(2)}` : stock.symbol}`
            : action === "short"
              ? `Short ${shares > 0 ? `${shares} × ` : ""}${stock.symbol}${shares > 0 ? ` · lock ${formatCurrency(total)}` : ""}`
              : action === "cover"
              ? `Cover ${shares > 0 ? `${shares} × ` : ""}${stock.symbol}${shares > 0 ? ` · ${formatCurrency(total)}` : ""}`
              : `${action === "buy" ? "Buy" : "Sell"} ${shares > 0 ? `${shares} × ` : ""}${stock.symbol}${shares > 0 ? ` · ${formatCurrency(total)}` : ""}`}
        </button>
      </div>
    </div>
  );
}
