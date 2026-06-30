"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { StockPrice, CompetitionParticipant } from "@/types";

interface Bet {
  id: string;
  symbol: string;
  company_name: string | null;
  direction: "up" | "down";
  entry_price: number;
  stake: number;
  timeframe: string;
  resolve_at: string;
  resolved: boolean;
  outcome: "win" | "loss" | "push" | null;
  exit_price: number | null;
  payout: number | null;
  created_at: string;
}

interface PredictionBetsProps {
  participant: CompetitionParticipant;
  stocks: StockPrice[];
  selectedStock: StockPrice | null;
  onTradeComplete: () => void;
}

const TIMEFRAMES = [
  { key: "15min", label: "15 min",  desc: "Quick flip" },
  { key: "1h",    label: "1 hour",  desc: "Short-term" },
  { key: "eod",   label: "End of day", desc: "Daily close" },
];

const STAKES = [50, 100, 250, 500, 1000];

function useCountdown(iso: string) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(iso).getTime() - Date.now());
      if (diff === 0) { setLabel("Resolving…"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(m > 0 ? `${m}m ${s.toString().padStart(2,"0")}s` : `${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return label;
}

function BetRow({ bet, prices }: { bet: Bet; prices: StockPrice[] }) {
  const countdown = useCountdown(bet.resolve_at);
  const currentPrice = prices.find(p => p.symbol === bet.symbol)?.price ?? bet.entry_price;
  const changePct = ((currentPrice - bet.entry_price) / bet.entry_price) * 100;
  const isWinning = bet.direction === "up" ? changePct > 0 : changePct < 0;

  if (bet.resolved) {
    const outcomeColor = bet.outcome === "win" ? "#4ade80" : bet.outcome === "push" ? "#fbbf24" : "#f87171";
    const outcomeIcon  = bet.outcome === "win" ? "✓" : bet.outcome === "push" ? "→" : "✗";
    return (
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.8)" }}>{bet.symbol}</span>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
              background: bet.direction === "up" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              color: bet.direction === "up" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
              {bet.direction.toUpperCase()}
            </span>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
              background: `${outcomeColor}18`, color: outcomeColor, fontWeight: 700 }}>
              {outcomeIcon} {bet.outcome?.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", fontFamily: "monospace" }}>
            ${bet.entry_price.toFixed(2)} → ${(bet.exit_price ?? bet.entry_price).toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: outcomeColor }}>
            {bet.outcome === "win" ? "+" : bet.outcome === "loss" ? "-" : ""}${bet.outcome === "loss" ? bet.stake.toFixed(0) : (bet.payout ?? 0).toFixed(0)}
          </div>
          <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>
            staked ${bet.stake.toFixed(0)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.8)" }}>{bet.symbol}</span>
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
            background: bet.direction === "up" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            color: bet.direction === "up" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
            {bet.direction.toUpperCase()}
          </span>
          <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)" }}>{bet.timeframe}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", fontFamily: "monospace" }}>
            entry ${bet.entry_price.toFixed(2)}
          </span>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: isWinning ? "#4ade80" : "#f87171" }}>
            now ${currentPrice.toFixed(2)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(232,234,240,0.7)" }}>
          ${bet.stake.toFixed(0)} → ${(bet.stake * 1.85).toFixed(0)}
        </div>
        <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", marginTop: 1, fontFamily: "monospace" }}>
          {countdown}
        </div>
      </div>
    </div>
  );
}

export default function PredictionBets({ participant, stocks, selectedStock, onTradeComplete }: PredictionBetsProps) {
  const supabase = getSupabaseClient();
  const [bets, setBets]         = useState<Bet[]>([]);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [stake, setStake]       = useState(100);
  const [customStake, setCustomStake] = useState("");
  const [timeframe, setTimeframe] = useState("15min");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  const stock = selectedStock ?? stocks[0];
  const effectiveStake = customStake ? parseFloat(customStake) || 0 : stake;
  const potentialPayout = Math.round(effectiveStake * 1.85 * 100) / 100;

  const loadBets = useCallback(async () => {
    const { data } = await supabase
      .from("prediction_bets")
      .select("*")
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setBets((data ?? []) as Bet[]);
  }, [participant.id, supabase]);

  useEffect(() => {
    loadBets();
    const t = setInterval(loadBets, 20_000);
    return () => clearInterval(t);
  }, [loadBets]);

  async function placeBet() {
    if (!stock) return;
    if (effectiveStake < 10) { setError("Minimum stake $10"); return; }
    if (effectiveStake > participant.cash_balance) { setError("Insufficient cash"); return; }

    setLoading(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/predict-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId:  participant.id,
          competitionId:  participant.competition_id,
          symbol:         stock.symbol,
          companyName:    stock.company_name ?? stock.symbol,
          direction,
          stake:          effectiveStake,
          timeframe,
          currentPrice:   stock.price,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setSuccess(`Bet placed! ${direction.toUpperCase()} ${stock.symbol} · potential $${data.potentialPayout}`);
      setCustomStake("");
      loadBets();
      onTradeComplete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const activeBets   = bets.filter(b => !b.resolved);
  const resolvedBets = bets.filter(b => b.resolved);
  const totalWinnings = resolvedBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
  const totalStaked   = resolvedBets.reduce((sum, b) => sum + b.stake, 0);
  const netPnl        = totalWinnings - totalStaked;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Place a bet */}
      <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,234,240,0.6)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
          <span>🎯 Place a Prediction</span>
          {stock && <span style={{ fontFamily: "monospace", color: "rgba(232,234,240,0.4)" }}>{stock.symbol} ${stock.price.toFixed(2)}</span>}
        </div>

        {!stock && (
          <div style={{ fontSize: 12, color: "rgba(232,234,240,0.4)", textAlign: "center", padding: "12px 0" }}>
            Select a stock to predict
          </div>
        )}

        {stock && (
          <>
            {/* UP / DOWN */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {(["up","down"] as const).map(d => (
                <button key={d} onClick={() => setDirection(d)} style={{
                  flex: 1, padding: "12px 0", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", border: "none",
                  background: direction === d
                    ? d === "up" ? "rgba(74,222,128,0.15)"  : "rgba(248,113,113,0.15)"
                    : "rgba(255,255,255,0.04)",
                  color: direction === d
                    ? d === "up" ? "#4ade80" : "#f87171"
                    : "rgba(232,234,240,0.35)",
                  boxShadow: direction === d
                    ? `inset 0 0 0 1px ${d === "up" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`
                    : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  transition: "all 0.15s",
                }}>
                  {d === "up" ? "▲ UP" : "▼ DOWN"}
                </button>
              ))}
            </div>

            {/* Stake */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stake</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                {STAKES.map(s => (
                  <button key={s} onClick={() => { setStake(s); setCustomStake(""); }} style={{
                    flex: "1 1 0", padding: "6px 0", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                    background: stake === s && !customStake ? "rgba(125,211,176,0.12)" : "rgba(255,255,255,0.04)",
                    color: stake === s && !customStake ? "#7dd3b0" : "rgba(232,234,240,0.45)",
                    boxShadow: stake === s && !customStake ? "inset 0 0 0 1px rgba(125,211,176,0.25)" : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  }}>${s}</button>
                ))}
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "rgba(232,234,240,0.4)" }}>$</span>
                <input
                  type="number" min="10" placeholder="Custom"
                  value={customStake}
                  onChange={e => setCustomStake(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px 8px 22px", fontSize: 13, color: "white", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
                />
              </div>
            </div>

            {/* Timeframe */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Timeframe</div>
              <div style={{ display: "flex", gap: 6 }}>
                {TIMEFRAMES.map(tf => (
                  <button key={tf.key} onClick={() => setTimeframe(tf.key)} style={{
                    flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
                    background: timeframe === tf.key ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
                    color: timeframe === tf.key ? "#7dd3b0" : "rgba(232,234,240,0.4)",
                    boxShadow: timeframe === tf.key ? "inset 0 0 0 1px rgba(125,211,176,0.25)" : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  }}>
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payout preview */}
            {effectiveStake >= 10 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "rgba(232,234,240,0.45)" }}>Win pays</span>
                <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#4ade80" }}>
                  +${(potentialPayout - effectiveStake).toFixed(0)} <span style={{ fontSize: 10, color: "rgba(74,222,128,0.6)" }}>(85%)</span>
                </span>
              </div>
            )}

            {error   && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8, padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 7 }}>⚠ {error}</div>}
            {success && <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 8, padding: "6px 10px", background: "rgba(74,222,128,0.08)", borderRadius: 7 }}>✓ {success}</div>}

            <button onClick={placeBet} disabled={loading || effectiveStake < 10}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: effectiveStake >= 10 && !loading ? "pointer" : "not-allowed",
                border: "none", opacity: effectiveStake >= 10 && !loading ? 1 : 0.35,
                background: direction === "up" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                color: direction === "up" ? "#4ade80" : "#f87171",
                boxShadow: `inset 0 0 0 1px ${direction === "up" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
              }}>
              {loading ? "Placing…" : `${direction === "up" ? "▲ Bet UP" : "▼ Bet DOWN"} · $${effectiveStake || "—"}`}
            </button>
          </>
        )}
      </div>

      {/* Active bets */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeBets.length > 0 && (
          <>
            <div style={{ padding: "8px 14px 4px", fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Active · {activeBets.length}
            </div>
            {activeBets.map(b => <BetRow key={b.id} bet={b} prices={stocks} />)}
          </>
        )}

        {resolvedBets.length > 0 && (
          <>
            <div style={{ padding: "8px 14px 4px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Settled
              </span>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: netPnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                net {netPnl >= 0 ? "+" : ""}${netPnl.toFixed(0)}
              </span>
            </div>
            {resolvedBets.map(b => <BetRow key={b.id} bet={b} prices={stocks} />)}
          </>
        )}

        {bets.length === 0 && (
          <div style={{ padding: "32px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🎯</div>
            <div style={{ fontSize: 12, color: "rgba(232,234,240,0.4)" }}>No bets yet</div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", marginTop: 4 }}>
              Pick a stock, choose UP or DOWN, and stake your cash
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
