"use client";

import { useState, useCallback } from "react";
import type { LeaderboardEntry } from "@/types";
import { formatCurrency } from "@/lib/stockApi";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
  startingCash: number;
  endDate: string;
  competitionId?: string;
  onBotsChanged?: () => void;
}

const BOT_META: Record<string, {
  name: string; emoji: string; color: string;
  tagline: string; description: string;
  glow: string; border: string;
}> = {
  index: {
    name: "The Indexer",
    emoji: "🏦",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.06)",
    border: "rgba(96,165,250,0.2)",
    tagline: "Slow. Steady. Deadly.",
    description: "Rebalances into 5 blue-chips every 20 min. Boring strategy — until you're losing to it.",
  },
  momentum: {
    name: "Surge",
    emoji: "⚡",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.2)",
    tagline: "Chases winners. Cuts losers fast.",
    description: "Sells anything down 2%+ today, buys the top daily gainers. Never hesitates.",
  },
  random: {
    name: "Wildcard",
    emoji: "🎲",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.06)",
    border: "rgba(167,139,250,0.2)",
    tagline: "Completely unpredictable.",
    description: "Random buys and sells. No strategy — pure chaos. Somehow it keeps winning.",
  },
};

interface BotData {
  botStrategy: string;
  cashBalance: number;
  holdingsValue: number;
  totalValue: number;
  holdings: { symbol: string; companyName: string; shares: number; avgCost: number; price: number; marketValue: number; pnl: number; pnlPct: number; changePercent: number }[];
  trades: { symbol: string; action: string; shares: number; price: number; total: number; executed_at: string }[];
}

function formatRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BotInspector({ participantId, strategy, startingCash }: {
  participantId: string; strategy: string; startingCash: number;
}) {
  const [data, setData]   = useState<BotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const meta = BOT_META[strategy] ?? BOT_META.random;

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/bot-inspect?participantId=${participantId}`);
      const json = await res.json();
      setData(json);
      setLoaded(true);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [participantId, loaded]);

  useState(() => { load(); });

  const cashPct = data && data.totalValue > 0 ? (data.cashBalance / data.totalValue) * 100 : 100;

  return (
    <div style={{ borderTop: `1px solid ${meta.border}`, background: meta.glow }}>

      {/* Strategy header */}
      <div style={{ padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize: 20 }}>{meta.emoji}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.name}</div>
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.55)", marginTop: 1, lineHeight: 1.4 }}>{meta.description}</div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: "12px 16px", fontSize: 11, color: "rgba(232,234,240,0.45)" }}>Loading…</div>
      )}

      {!loading && !data && (
        <div style={{ padding: "12px 16px", fontSize: 11, color: "rgba(232,234,240,0.45)" }}>
          No trades yet — bot executes on the next price refresh.
        </div>
      )}

      {data && (
        <>
          {/* Cash / holdings bar */}
          <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(232,234,240,0.5)", marginBottom: 4, fontFamily: "monospace" }}>
              <span>Cash {cashPct.toFixed(0)}% · {formatCurrency(data.cashBalance)}</span>
              <span>Stocks {(100 - cashPct).toFixed(0)}% · {formatCurrency(data.holdingsValue)}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden", display: "flex" }}>
              <div style={{ height: "100%", background: "#60a5fa", width: `${cashPct}%`, transition: "width 0.4s" }} />
              <div style={{ height: "100%", background: meta.color, width: `${100 - cashPct}%`, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* Holdings */}
          {data.holdings.length > 0 && (
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ padding: "6px 16px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Positions ({data.holdings.length})
              </div>
              {data.holdings.map(h => (
                <div key={h.symbol} style={{ padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>{h.symbol}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 700,
                        background: h.pnl >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                        color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                        {h.pnl >= 0 ? "+" : ""}{h.pnlPct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", fontFamily: "monospace", marginTop: 1 }}>
                      {h.shares} sh · avg ${h.avgCost.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>{formatCurrency(h.marketValue)}</div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: h.pnl >= 0 ? "#4ade80" : "#f87171", marginTop: 1 }}>
                      {h.pnl >= 0 ? "+" : ""}{formatCurrency(h.pnl)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent trades */}
          <div>
            <div style={{ padding: "6px 16px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Recent trades ({data.trades.length})
            </div>
            {data.trades.length === 0 ? (
              <div style={{ padding: "10px 16px", fontSize: 11, color: "rgba(232,234,240,0.45)" }}>
                No trades yet.
              </div>
            ) : (
              data.trades.map((t, i) => {
                const isBuy = t.action === "buy";
                return (
                  <div key={i} style={{ padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, flexShrink: 0,
                      background: isBuy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                      color: isBuy ? "#4ade80" : "#f87171",
                      border: `1px solid ${isBuy ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}` }}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.85)" }}>{t.symbol}</span>
                      <span style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", fontFamily: "monospace", marginLeft: 6 }}>
                        {t.shares} × ${t.price.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: isBuy ? "#f87171" : "#4ade80" }}>
                        {isBuy ? "−" : "+"}{formatCurrency(t.total)}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(232,234,240,0.45)", marginTop: 1 }}>{formatRelTime(t.executed_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Leaderboard({ entries, currentUserId, startingCash, endDate, competitionId, onBotsChanged }: LeaderboardProps) {
  const [toggling, setToggling]   = useState(false);
  const [expandedBot, setExpandedBot] = useState<string | null>(null);

  const daysLeft = Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const hasBots  = entries.some(e => e.is_bot);

  async function handleBotToggle() {
    if (!competitionId) return;
    setToggling(true);
    setExpandedBot(null);
    try {
      await fetch("/api/bots", {
        method: hasBots ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId, startingCash }),
      });
      onBotsChanged?.();
    } catch (err) { console.error("Bot toggle error:", err); }
    finally { setToggling(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Leaderboard
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.55)", marginTop: 2 }}>
              {daysLeft}d remaining
            </div>
          </div>
          {competitionId && (
            <button
              onClick={handleBotToggle}
              disabled={toggling}
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: toggling ? "wait" : "pointer",
                background: hasBots ? "rgba(248,113,113,0.08)" : "rgba(125,211,176,0.08)",
                border: hasBots ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(125,211,176,0.2)",
                color: hasBots ? "#f87171" : "#7dd3b0",
                opacity: toggling ? 0.5 : 1, transition: "all 0.2s" }}>
              {toggling ? "…" : hasBots ? "✕ Remove bots" : "+ Add bots"}
            </button>
          )}
        </div>
        {hasBots && (
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 4 }}>
            Tap a bot row to see their portfolio and recent trades
          </div>
        )}
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {entries.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.55)" }}>No competitors yet</div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.38)", marginTop: 6 }}>Add bots to start competing</div>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const isCurrentUser = entry.user_id === currentUserId;
            const isPositive    = entry.return_amount >= 0;
            const rankEmoji     = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
            const strategy      = entry.bot_strategy ?? "random";
            const meta          = entry.is_bot ? (BOT_META[strategy] ?? BOT_META.random) : null;
            const isExpanded    = expandedBot === entry.participant_id;

            return (
              <div key={entry.participant_id}>
                <div
                  onClick={() => entry.is_bot && setExpandedBot(isExpanded ? null : entry.participant_id)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)",
                    background: isCurrentUser
                      ? "rgba(125,211,176,0.04)"
                      : isExpanded
                        ? (meta?.glow ?? "rgba(255,255,255,0.02)")
                        : "transparent",
                    borderLeft: isCurrentUser ? "2px solid #7dd3b0" : meta && isExpanded ? `2px solid ${meta.color}` : "2px solid transparent",
                    cursor: entry.is_bot ? "pointer" : "default",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

                    {/* Rank badge */}
                    <div style={{
                      width: 28, height: 28, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                      background: idx === 0 ? "rgba(255,215,0,0.12)" : idx === 1 ? "rgba(192,192,192,0.08)" : idx === 2 ? "rgba(205,127,50,0.08)" : "rgba(255,255,255,0.04)",
                      color: idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "rgba(232,234,240,0.45)",
                    }}>
                      {rankEmoji ?? entry.rank}
                    </div>

                    {/* Name + labels */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                        {meta && <span style={{ fontSize: 14 }}>{meta.emoji}</span>}
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: isCurrentUser ? "#7dd3b0" : meta ? meta.color : "rgba(232,234,240,0.88)",
                        }}>
                          {entry.username}
                        </span>
                        {isCurrentUser && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
                            background: "rgba(125,211,176,0.12)", color: "#7dd3b0", border: "1px solid rgba(125,211,176,0.2)", flexShrink: 0 }}>
                            YOU
                          </span>
                        )}
                        {meta && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 99,
                            background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.border}`, flexShrink: 0 }}>
                            AI
                          </span>
                        )}
                      </div>
                      {meta && (
                        <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", fontStyle: "italic" }}>
                          {meta.tagline}
                        </div>
                      )}
                      {!meta && (
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(232,234,240,0.45)" }}>
                          {formatCurrency(entry.total_value)}
                        </div>
                      )}
                    </div>

                    {/* Return + expand */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: isPositive ? "#4ade80" : "#f87171" }}>
                          {isPositive ? "+" : ""}{entry.return_percent.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", marginTop: 2, color: isPositive ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)" }}>
                          {isPositive ? "+" : ""}{formatCurrency(entry.return_amount)}
                        </div>
                      </div>
                      {entry.is_bot && (
                        <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none", display: "block" }}>
                          ▶
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 8, marginLeft: 38, height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 1, transition: "width 0.5s ease",
                      width: `${Math.min(100, Math.max(0, (entry.total_value / (startingCash * 1.5)) * 100))}%`,
                      background: meta ? meta.color : isPositive ? "#4ade80" : "#f87171",
                      opacity: 0.35,
                    }} />
                  </div>
                </div>

                {/* Expanded bot inspector */}
                {isExpanded && (
                  <BotInspector
                    participantId={entry.participant_id}
                    strategy={strategy}
                    startingCash={startingCash}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
