"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompetitionParticipant, StockPrice, OptionPosition } from "@/types";
import {
  blackScholesPremium,
  timeToExpiryYears,
  generateStrikes,
  generateExpiries,
  totalPremiumCost,
  CONTRACT_SIZE,
  type StrikeInfo,
} from "@/lib/options-pricing";

interface OptionsPanelProps {
  participant: CompetitionParticipant;
  stocks: StockPrice[];
  selectedStock: StockPrice | null;
  onSelectStock?: (symbol: string) => void;
  onTradeComplete?: () => void;
}

type OptionType = "call" | "put";

interface BuyState {
  strike: number;
  expiry: string;
  optionType: OptionType;
  contracts: number;
  premium: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatExpiry(date: string): string {
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (date === today.toISOString().split("T")[0]) return "Today";
  if (date === tomorrow.toISOString().split("T")[0]) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

function dte(expiry: string): number {
  const diffMs = new Date(expiry + "T23:59:59Z").getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export default function OptionsPanel({
  participant,
  stocks,
  selectedStock,
  onTradeComplete,
}: OptionsPanelProps) {
  const [expiries]  = useState<string[]>(() => generateExpiries());
  const [expiry,    setExpiry]    = useState<string>(() => generateExpiries()[1]); // default: tomorrow
  const [optType,   setOptType]   = useState<OptionType>("call");
  const [buyState,  setBuyState]  = useState<BuyState | null>(null);
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [history,   setHistory]   = useState<OptionPosition[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const stock = selectedStock ?? stocks[0] ?? null;

  // ── Fetch positions ──────────────────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    if (!participant?.id) return;
    try {
      const res = await fetch(`/api/options?participantId=${participant.id}&symbol=ALL`);
      if (!res.ok) return;
      const { open, settled } = await res.json() as { open: OptionPosition[]; settled: OptionPosition[] };
      setPositions(open ?? []);
      setHistory(settled ?? []);
    } catch { /* silent */ }
  }, [participant?.id]);

  useEffect(() => {
    fetchPositions();
    const t = setInterval(fetchPositions, 30_000);
    return () => clearInterval(t);
  }, [fetchPositions]);

  // ── Strike chain ─────────────────────────────────────────────────────────
  const currentPrice = stock?.price ?? 0;
  const strikes: StrikeInfo[] = currentPrice > 0 ? generateStrikes(currentPrice) : [];
  const T = timeToExpiryYears(expiry);

  function premium(strike: number, type: OptionType): number {
    if (currentPrice <= 0) return 0;
    return blackScholesPremium(currentPrice, strike, T, type);
  }

  function openBuy(strike: number) {
    const prem = premium(strike, optType);
    setBuyState({ strike, expiry, optionType: optType, contracts: 1, premium: prem });
    setError(null);
  }

  // ── Execute buy ───────────────────────────────────────────────────────────
  async function executeBuy() {
    if (!buyState || !stock) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          competitionId: participant.competition_id,
          symbol:      stock.symbol,
          companyName: stock.company_name,
          optionType:  buyState.optionType,
          strike:      buyState.strike,
          expiry:      buyState.expiry,
          contracts:   buyState.contracts,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Trade failed"); return; }
      setBuyState(null);
      await fetchPositions();
      onTradeComplete?.();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // ── Moneyness for the selected type ─────────────────────────────────────
  function moneynessForType(strike: number, type: OptionType): "ITM" | "ATM" | "OTM" {
    const diff = Math.abs(strike - currentPrice);
    const tick = currentPrice >= 10 ? 1 : 0.25;
    if (diff < tick * 0.6) return "ATM";
    if (type === "call") return strike < currentPrice ? "ITM" : "OTM";
    return strike > currentPrice ? "ITM" : "OTM";
  }

  // ── Live P&L for open position ───────────────────────────────────────────
  function livePnL(pos: OptionPosition): { value: number; pnl: number; pct: number } {
    const sp = stocks.find(s => s.symbol === pos.symbol);
    const sPrice = sp?.price ?? 0;
    const curPrem = sPrice > 0
      ? blackScholesPremium(sPrice, pos.strike, timeToExpiryYears(pos.expiry), pos.option_type as OptionType)
      : 0;
    const cost  = pos.premium_paid * CONTRACT_SIZE * pos.contracts;
    const value = curPrem * CONTRACT_SIZE * pos.contracts;
    const pnl   = value - cost;
    const pct   = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, pnl, pct };
  }

  const totalCost = buyState ? totalPremiumCost(buyState.premium, buyState.contracts) : 0;
  const canAfford = totalCost <= participant.cash_balance;

  // ── No stock selected ────────────────────────────────────────────────────
  if (!stock) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.4)", fontSize: 12 }}>
        Select a stock to view options
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header ── */}
      <div style={{ padding: "12px 14px 8px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(232,234,240,0.95)" }}>{stock.symbol}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(232,234,240,0.55)" }}>
                ${currentPrice.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>
              {stock.company_name ?? stock.symbol} · Options Chain
            </div>
          </div>
          <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", textAlign: "right" }}>
            1 contract = {CONTRACT_SIZE} shares
          </div>
        </div>

        {/* Call / Put toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["call", "put"] as OptionType[]).map(t => (
            <button key={t} onClick={() => setOptType(t)} style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid",
              background: optType === t
                ? (t === "call" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)")
                : "rgba(255,255,255,0.03)",
              borderColor: optType === t
                ? (t === "call" ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)")
                : "rgba(255,255,255,0.08)",
              color: optType === t
                ? (t === "call" ? "#4ade80" : "#f87171")
                : "rgba(232,234,240,0.4)",
            }}>
              {t === "call" ? "▲ CALL" : "▼ PUT"}
            </button>
          ))}
        </div>

        {/* Expiry selector */}
        <div style={{ display: "flex", gap: 3 }}>
          {expiries.map(e => (
            <button key={e} onClick={() => setExpiry(e)} style={{
              flex: 1, padding: "4px 0", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid",
              background: expiry === e ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.02)",
              borderColor: expiry === e ? "rgba(125,211,176,0.35)" : "rgba(255,255,255,0.06)",
              color: expiry === e ? "#7dd3b0" : "rgba(232,234,240,0.4)",
            }}>
              {formatExpiry(e)}
              <span style={{ display: "block", fontSize: 8, opacity: 0.7 }}>{dte(e)}d</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Buy drawer ── */}
      {buyState && (
        <div style={{
          margin: "10px 14px",
          padding: "12px 14px",
          background: "rgba(125,211,176,0.05)",
          border: "1px solid rgba(125,211,176,0.2)",
          borderRadius: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: buyState.optionType === "call" ? "#4ade80" : "#f87171" }}>
              {stock.symbol} {buyState.optionType.toUpperCase()} ${buyState.strike} · {formatExpiry(buyState.expiry)}
            </div>
            <button onClick={() => setBuyState(null)}
              style={{ fontSize: 14, color: "rgba(232,234,240,0.4)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Contracts */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
              Contracts
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 5, 10].map(n => (
                <button key={n} onClick={() => setBuyState(s => s ? { ...s, contracts: n } : null)} style={{
                  flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid",
                  background: buyState.contracts === n ? "rgba(125,211,176,0.12)" : "rgba(255,255,255,0.04)",
                  borderColor: buyState.contracts === n ? "rgba(125,211,176,0.4)" : "rgba(255,255,255,0.08)",
                  color: buyState.contracts === n ? "#7dd3b0" : "rgba(232,234,240,0.5)",
                }}>{n}</button>
              ))}
            </div>
          </div>

          {/* Cost breakdown */}
          <div style={{ fontSize: 11, color: "rgba(232,234,240,0.55)", marginBottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Premium per share</span>
              <span style={{ fontFamily: "monospace", color: "rgba(232,234,240,0.8)" }}>${buyState.premium.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>× {CONTRACT_SIZE} shares × {buyState.contracts} contracts</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 4, marginTop: 2 }}>
              <span style={{ fontWeight: 700, color: "rgba(232,234,240,0.8)" }}>Total cost</span>
              <span style={{ fontFamily: "monospace", fontWeight: 800, color: canAfford ? "#7dd3b0" : "#f87171" }}>
                ${totalCost.toFixed(2)}
              </span>
            </div>
            {!canAfford && (
              <div style={{ fontSize: 10, color: "#f87171" }}>Insufficient funds</div>
            )}
          </div>

          {/* Payout info */}
          <div style={{ padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 6, marginBottom: 10, fontSize: 10, color: "rgba(232,234,240,0.45)" }}>
            {buyState.optionType === "call"
              ? `Profit if ${stock.symbol} > $${buyState.strike} at expiry. Each $1 move above strike = $${(CONTRACT_SIZE * buyState.contracts).toLocaleString()} profit.`
              : `Profit if ${stock.symbol} < $${buyState.strike} at expiry. Each $1 move below strike = $${(CONTRACT_SIZE * buyState.contracts).toLocaleString()} profit.`
            }
          </div>

          {error && (
            <div style={{ fontSize: 10, color: "#f87171", marginBottom: 8, background: "rgba(248,113,113,0.06)", padding: "5px 8px", borderRadius: 5 }}>
              ⚠ {error}
            </div>
          )}

          <button onClick={executeBuy} disabled={loading || !canAfford} style={{
            width: "100%", padding: "9px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: canAfford ? "pointer" : "not-allowed",
            background: canAfford
              ? (buyState.optionType === "call" ? "linear-gradient(135deg,#4ade80,#22c55e)" : "linear-gradient(135deg,#f87171,#ef4444)")
              : "rgba(255,255,255,0.06)",
            color: canAfford ? "#060a14" : "rgba(232,234,240,0.3)",
            border: "none",
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Buying…" : `Buy ${buyState.contracts} ${buyState.optionType.toUpperCase()} contract${buyState.contracts > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* ── Strike chain ── */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Column headers */}
        <div style={{ display: "flex", padding: "5px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "#060a14", zIndex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", width: 70 }}>Strike</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", flex: 1 }}>Premium</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", width: 50 }}>ITM%</div>
          <div style={{ width: 44 }} />
        </div>

        {strikes.map(({ strike }) => {
          const mm = moneynessForType(strike, optType);
          const prem = premium(strike, optType);
          const isAtm = mm === "ATM";
          const isItm = mm === "ITM";
          const intrinsic = optType === "call" ? Math.max(0, currentPrice - strike) : Math.max(0, strike - currentPrice);
          const itmPct = prem > 0 ? (intrinsic / prem) * 100 : 0;
          return (
            <div key={strike} style={{
              display: "flex", alignItems: "center",
              padding: "7px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: isAtm
                ? "rgba(125,211,176,0.06)"
                : isItm
                  ? "rgba(255,255,255,0.025)"
                  : "transparent",
              borderLeft: isAtm ? "2px solid rgba(125,211,176,0.4)" : "2px solid transparent",
            }}>
              {/* Strike */}
              <div style={{ width: 70 }}>
                <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: isAtm ? "#7dd3b0" : "rgba(232,234,240,0.85)" }}>
                  ${strike.toFixed(strike < 10 ? 2 : 0)}
                </div>
                <div style={{ fontSize: 8, color: isAtm ? "rgba(125,211,176,0.7)" : isItm ? "rgba(74,222,128,0.6)" : "rgba(232,234,240,0.3)", fontWeight: 700 }}>
                  {isAtm ? "ATM" : isItm ? "ITM" : "OTM"}
                </div>
              </div>

              {/* Premium */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: optType === "call" ? "#4ade80" : "#f87171" }}>
                  ${prem.toFixed(2)}
                </div>
                <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)" }}>
                  /${CONTRACT_SIZE} = ${(prem * CONTRACT_SIZE).toFixed(0)}
                </div>
              </div>

              {/* ITM% */}
              <div style={{ width: 50, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: isItm ? "#4ade80" : "rgba(232,234,240,0.3)" }}>
                  {isItm ? `${itmPct.toFixed(0)}%` : "—"}
                </div>
              </div>

              {/* Buy button */}
              <button onClick={() => openBuy(strike)} style={{
                width: 40, padding: "4px 0", borderRadius: 5, fontSize: 9, fontWeight: 800, cursor: "pointer",
                border: "1px solid",
                background: buyState?.strike === strike ? "rgba(125,211,176,0.15)" : "rgba(255,255,255,0.04)",
                borderColor: buyState?.strike === strike ? "rgba(125,211,176,0.5)" : "rgba(255,255,255,0.1)",
                color: buyState?.strike === strike ? "#7dd3b0" : "rgba(232,234,240,0.6)",
              }}>
                Buy
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Open positions ── */}
      {positions.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ padding: "8px 14px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Open Positions ({positions.length})
          </div>
          {positions.slice(0, 5).map(pos => {
            const { pnl, pct, value } = livePnL(pos);
            const up = pnl >= 0;
            return (
              <div key={pos.id} style={{
                padding: "8px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(255,255,255,0.01)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: pos.option_type === "call" ? "#4ade80" : "#f87171" }}>
                      {pos.option_type.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: "monospace", marginLeft: 4, color: "rgba(232,234,240,0.7)" }}>
                      {pos.symbol} ${pos.strike} · {formatExpiry(pos.expiry)}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: up ? "#4ade80" : "#f87171" }}>
                      {up ? "+" : ""}${pnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 9, color: up ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)" }}>
                      {up ? "+" : ""}{pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 9, color: "rgba(232,234,240,0.4)" }}>
                  <span>{pos.contracts}× contract{pos.contracts > 1 ? "s" : ""}</span>
                  <span>Cost ${(pos.premium_paid * CONTRACT_SIZE * pos.contracts).toFixed(2)}</span>
                  <span>Val ${value.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Settled history ── */}
      {history.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ width: "100%", padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            History ({history.length}) {showHistory ? "▲" : "▼"}
          </button>
          {showHistory && history.slice(0, 10).map(pos => {
            const p = pos.pnl ?? 0;
            const up = p >= 0;
            return (
              <div key={pos.id} style={{
                padding: "7px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: pos.option_type === "call" ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)" }}>
                    {pos.option_type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", marginLeft: 4, color: "rgba(232,234,240,0.5)" }}>
                    {pos.symbol} ${pos.strike} · expired {formatExpiry(pos.expiry)}
                  </span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: up ? "#4ade80" : "rgba(248,113,113,0.8)" }}>
                  {up ? "+" : ""}${p.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
