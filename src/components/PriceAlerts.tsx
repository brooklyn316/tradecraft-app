"use client";

import { useEffect, useState } from "react";
import type { StockPrice } from "@/types";
import { getPriceAlerts, addPriceAlert, removePriceAlert, type PriceAlert } from "@/lib/stockApi";

interface PriceAlertsProps {
  userId: string;
  stocks: StockPrice[];
  onSelectSymbol: (symbol: string) => void;
  refreshKey?: number;
}

export default function PriceAlerts({ userId, stocks, onSelectSymbol, refreshKey }: PriceAlertsProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formSymbol, setFormSymbol] = useState("");
  const [formCondition, setFormCondition] = useState<"above" | "below">("above");
  const [formPrice, setFormPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPriceAlerts(userId)
      .then(data => { setAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId, refreshKey]);

  const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s]));

  // Pre-fill price when symbol is chosen
  function handleSymbolChange(sym: string) {
    setFormSymbol(sym.toUpperCase());
    const sp = priceMap[sym.toUpperCase()];
    if (sp) setFormPrice(sp.price.toFixed(2));
  }

  async function handleAddAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!formSymbol || !formPrice) return;
    const price = parseFloat(formPrice);
    if (isNaN(price) || price <= 0) { setError("Enter a valid price"); return; }
    setSaving(true);
    setError(null);
    try {
      const sp = priceMap[formSymbol];
      await addPriceAlert(userId, formSymbol, sp?.company_name ?? null, formCondition, price);
      const updated = await getPriceAlerts(userId);
      setAlerts(updated);
      setFormSymbol(""); setFormPrice(""); setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add alert");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(alertId: string) {
    await removePriceAlert(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>🔔 Price Alerts</div>
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginTop: 1 }}>{alerts.length} active</div>
        </div>
        <button onClick={() => { setShowForm(f => !f); setError(null); }}
          style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: showForm ? "rgba(248,113,113,0.1)" : "rgba(125,211,176,0.1)",
            border: showForm ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(125,211,176,0.2)",
            color: showForm ? "#f87171" : "#7dd3b0" }}>
          {showForm ? "✕ Cancel" : "+ New Alert"}
        </button>
      </div>

      {/* Add alert form */}
      {showForm && (
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, background: "rgba(125,211,176,0.03)" }}>
          <form onSubmit={handleAddAlert} style={{ display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Symbol picker */}
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Stock</label>
              <select value={formSymbol} onChange={e => handleSymbolChange(e.target.value)} required
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: formSymbol ? "rgba(232,234,240,0.9)" : "rgba(232,234,240,0.52)", cursor: "pointer" }}>
                <option value="">Select a stock…</option>
                {stocks.sort((a, b) => a.symbol.localeCompare(b.symbol)).map(s => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol} — ${s.price.toFixed(2)}</option>
                ))}
              </select>
            </div>

            {/* Condition + Price row */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Condition</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["above","below"] as const).map(c => (
                    <button key={c} type="button" onClick={() => setFormCondition(c)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
                        background: formCondition === c ? (c === "above" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)") : "rgba(255,255,255,0.04)",
                        border: formCondition === c ? `1px solid ${c === "above" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}` : "1px solid rgba(255,255,255,0.08)",
                        color: formCondition === c ? (c === "above" ? "#4ade80" : "#f87171") : "rgba(232,234,240,0.4)" }}>
                      {c === "above" ? "↑ Above" : "↓ Below"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Target Price</label>
                <input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)}
                  placeholder="0.00" step="0.01" min="0.01" required
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "rgba(232,234,240,0.9)", fontFamily: "monospace", boxSizing: "border-box" }} />
              </div>
            </div>

            {error && <div style={{ fontSize: 11, color: "#f87171" }}>{error}</div>}

            <button type="submit" disabled={saving || !formSymbol || !formPrice}
              style={{ padding: "10px", borderRadius: 9, background: "linear-gradient(135deg,rgba(125,211,176,0.15),rgba(74,222,128,0.08))", border: "1px solid rgba(125,211,176,0.25)", color: "#7dd3b0", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: (!formSymbol || !formPrice) ? 0.4 : 1 }}>
              {saving ? "Setting alert…" : "Set Alert"}
            </button>
          </form>
        </div>
      )}

      {/* Alerts list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "rgba(232,234,240,0.52)" }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: "48px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔔</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(232,234,240,0.4)", fontWeight: 500 }}>No alerts set</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.45)", marginTop: 4 }}>Get notified when a stock hits your target price</div>
            </div>
          </div>
        ) : (
          alerts.map(alert => {
            const sp = priceMap[alert.symbol];
            const currentPrice = sp?.price ?? null;
            const distance = currentPrice ? Math.abs(currentPrice - alert.target_price) : null;
            const distancePct = currentPrice ? ((alert.target_price - currentPrice) / currentPrice) * 100 : null;
            const isClose = distancePct !== null && Math.abs(distancePct) < 3;

            return (
              <div key={alert.id} style={{ padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>

                {/* Condition indicator */}
                <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  background: alert.condition === "above" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                  border: `1px solid ${alert.condition === "above" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}` }}>
                  {alert.condition === "above" ? "↑" : "↓"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <button onClick={() => onSelectSymbol(alert.symbol)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>
                      {alert.symbol}
                    </button>
                    <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: alert.condition === "above" ? "#4ade80" : "#f87171" }}>
                      ${alert.target_price.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>
                      {alert.condition === "above" ? "Notify when above" : "Notify when below"}
                    </span>
                    {currentPrice && (
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: isClose ? "#fbbf24" : "rgba(232,234,240,0.52)" }}>
                        now ${currentPrice.toFixed(2)} {isClose ? "⚡ close" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Remove */}
                <button onClick={() => handleRemove(alert.id)}
                  style={{ background: "none", border: "none", color: "rgba(232,234,240,0.45)", fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
