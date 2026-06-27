"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/stockApi";

interface LimitOrder {
  id: string;
  symbol: string;
  company_name: string | null;
  action: "buy" | "sell";
  shares: number;
  target_price: number;
  status: "pending" | "filled" | "cancelled";
  created_at: string;
  filled_at: string | null;
  filled_price: number | null;
}

interface LimitOrdersProps {
  participantId: string;
  refreshKey?: number;
  onOrderFilled?: (order: LimitOrder) => void;
}

function formatAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LimitOrders({ participantId, refreshKey, onOrderFilled }: LimitOrdersProps) {
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "filled" | "all">("pending");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/limit-orders?participantId=${participantId}`);
      const data = await res.json();
      const newOrders: LimitOrder[] = data.orders ?? [];

      // Detect newly filled orders
      setOrders(prev => {
        const prevPending = new Set(prev.filter(o => o.status === "pending").map(o => o.id));
        for (const o of newOrders) {
          if (o.status === "filled" && prevPending.has(o.id)) {
            onOrderFilled?.(o);
          }
        }
        return newOrders;
      });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [participantId, onOrderFilled]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function cancel(orderId: string) {
    setCancelling(orderId);
    try {
      await fetch("/api/limit-orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      await load();
    } finally { setCancelling(null); }
  }

  const filtered = orders.filter(o => filter === "all" ? true : o.status === filter);
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const filledCount  = orders.filter(o => o.status === "filled").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
          Limit Orders
        </div>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6 }}>
          {([["pending", `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}`], ["filled", `Filled${filledCount > 0 ? ` (${filledCount})` : ""}`], ["all", "All"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid",
                background: filter === val ? "rgba(125,211,176,0.1)" : "transparent",
                borderColor: filter === val ? "rgba(125,211,176,0.3)" : "rgba(255,255,255,0.08)",
                color: filter === val ? "#7dd3b0" : "rgba(232,234,240,0.52)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 11, color: "rgba(232,234,240,0.5)" }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.5)", marginBottom: 6 }}>
              {filter === "pending" ? "No pending orders" : filter === "filled" ? "No filled orders yet" : "No orders yet"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.60)", lineHeight: 1.6 }}>
              Place a limit order from the Trade tab by switching to Limit mode.
            </div>
          </div>
        )}

        {filtered.map(order => {
          const isBuy    = order.action === "buy";
          const isPending = order.status === "pending";
          const isFilled  = order.status === "filled";
          const actionColor = isBuy ? "#4ade80" : "#f87171";
          const actionBg    = isBuy ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";
          const actionBorder = isBuy ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)";

          return (
            <div key={order.id} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              opacity: order.status === "cancelled" ? 0.4 : 1 }}>

              {/* Top: action badge + symbol + status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.04em",
                    background: actionBg, color: actionColor, border: `1px solid ${actionBorder}` }}>
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(232,234,240,0.9)" }}>{order.symbol}</span>
                  {order.company_name && (
                    <span style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
                      {order.company_name}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em",
                  background: isPending ? "rgba(251,191,36,0.08)" : isFilled ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.04)",
                  color: isPending ? "#fbbf24" : isFilled ? "#4ade80" : "rgba(232,234,240,0.5)",
                  border: `1px solid ${isPending ? "rgba(251,191,36,0.2)" : isFilled ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                  {order.status}
                </span>
              </div>

              {/* Details grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: isPending ? 10 : 0 }}>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Shares</div>
                  <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.8)" }}>{order.shares}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                    {isFilled ? "Filled at" : "Target"}
                  </div>
                  <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: isFilled ? "#4ade80" : "rgba(232,234,240,0.8)" }}>
                    {formatCurrency(isFilled && order.filled_price ? order.filled_price : order.target_price)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Total value</div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.5)" }}>
                    {formatCurrency(order.shares * (isFilled && order.filled_price ? order.filled_price : order.target_price))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(232,234,240,0.65)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                    {isFilled ? "Filled" : "Placed"}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.60)" }}>
                    {formatAge(isFilled && order.filled_at ? order.filled_at : order.created_at)}
                  </div>
                </div>
              </div>

              {/* Trigger condition */}
              {isPending && (
                <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginBottom: 10, padding: "5px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.04)" }}>
                  Triggers when {order.symbol} {isBuy ? "drops to or below" : "rises to or above"} {formatCurrency(order.target_price)}
                </div>
              )}

              {/* Cancel button */}
              {isPending && (
                <button onClick={() => cancel(order.id)} disabled={cancelling === order.id}
                  style={{ width: "100%", padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: cancelling === order.id ? "wait" : "pointer",
                    background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171",
                    opacity: cancelling === order.id ? 0.5 : 1, transition: "all 0.15s" }}>
                  {cancelling === order.id ? "Cancelling…" : "Cancel Order"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
