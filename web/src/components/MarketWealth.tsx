"use client";

import { useCallback, useEffect, useState } from "react";

interface Transaction {
  amount:     number;
  reason:     string;
  created_at: string;
}

interface MarketWealthProps {
  userId: string;
}

const REASON_LABELS: Record<string, { label: string; emoji: string }> = {
  competition_participation: { label: "Competition — Participated",  emoji: "🏁" },
  competition_1st:           { label: "Competition — 1st Place",     emoji: "🥇" },
  competition_2nd:           { label: "Competition — 2nd Place",     emoji: "🥈" },
  competition_3rd:           { label: "Competition — 3rd Place",     emoji: "🥉" },
  bracket_win:               { label: "Bracket Tournament Win",      emoji: "🏆" },
  daily_challenge:           { label: "Daily Challenge",             emoji: "✅" },
  badge_first_trade:         { label: "Badge: First Blood",          emoji: "🎯" },
  badge_big_spender:         { label: "Badge: High Roller",          emoji: "💰" },
  badge_first_short:         { label: "Badge: Bear Mode",            emoji: "🐻" },
  badge_first_options:       { label: "Badge: Options Trader",       emoji: "⚙" },
  badge_diversified:         { label: "Badge: Diversified",          emoji: "🌐" },
  badge_challenge_1:         { label: "Badge: Challenger",           emoji: "✅" },
  badge_challenge_10:        { label: "Badge: Serial Completer",     emoji: "🏆" },
  badge_profit_10pct:        { label: "Badge: Ten Bagger",           emoji: "📈" },
  badge_streak_3:            { label: "Badge: On Fire",              emoji: "🔥" },
  badge_streak_7:            { label: "Badge: Week Warrior",         emoji: "🌟" },
  badge_streak_30:           { label: "Badge: Legendary",            emoji: "👑" },
};

function reasonLabel(reason: string): { label: string; emoji: string } {
  return REASON_LABELS[reason] ?? { label: reason.replace(/_/g, " "), emoji: "💎" };
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MarketWealth({ userId }: MarketWealthProps) {
  const [balance,     setBalance]     = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-wealth?userId=${userId}`);
      if (!res.ok) return;
      const { balance: b, total_earned: te, transactions: t } = await res.json();
      setBalance(b ?? 0);
      setTotalEarned(te ?? 0);
      setTransactions(t ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        Loading…
      </div>
    );
  }

  // How MW is earned
  const EARN_WAYS = [
    { emoji: "🏁", label: "Participate in competition",  amount: 100  },
    { emoji: "🥇", label: "Win a competition",           amount: 1000 },
    { emoji: "🥈", label: "2nd place",                   amount: 500  },
    { emoji: "🥉", label: "3rd place",                   amount: 250  },
    { emoji: "✅", label: "Complete daily challenge",    amount: 50   },
    { emoji: "🏅", label: "Earn a badge",                amount: "25–1000" },
    { emoji: "🏆", label: "Win bracket tournament",      amount: 2000 },
  ];

  return (
    <div>
      {/* Balance card */}
      <div style={{
        margin: "14px 14px 0",
        padding: "16px",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(125,211,176,0.1), rgba(74,222,128,0.06))",
        border: "1px solid rgba(125,211,176,0.25)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Market Wealth Balance
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6 }}>
          <span style={{ fontSize: 32, fontWeight: 900, fontFamily: "monospace", color: "#7dd3b0" }}>
            {balance.toLocaleString()}
          </span>
          <span style={{ fontSize: 14, color: "#7dd3b0", fontWeight: 700 }}>MW</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginTop: 4 }}>
          {totalEarned.toLocaleString()} total earned all-time
        </div>
      </div>

      {/* What can you do with MW — teaser */}
      <div style={{ margin: "10px 14px", padding: "8px 10px", background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", marginBottom: 3 }}>Coming soon</div>
        <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>
          Spend MW on profile cosmetics, competition boosts, and exclusive perks.
        </div>
      </div>

      {/* How to earn */}
      <div style={{ padding: "8px 14px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          How to earn MW
        </div>
        {EARN_WAYS.map(w => (
          <div key={w.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{w.emoji}</span>
            <span style={{ flex: 1, fontSize: 10, color: "rgba(232,234,240,0.55)" }}>{w.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: "#fbbf24", flexShrink: 0 }}>
              +{typeof w.amount === "number" ? w.amount.toLocaleString() : w.amount}
            </span>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 4 }}>
        <div style={{ padding: "8px 14px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Recent Earnings
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 11, color: "rgba(232,234,240,0.3)", textAlign: "center" }}>
            No earnings yet — complete a competition or daily challenge!
          </div>
        ) : transactions.map((t, i) => {
          const { label, emoji } = reasonLabel(t.reason);
          const positive = t.amount >= 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "rgba(232,234,240,0.75)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>
                  {timeAgo(t.created_at)}
                </div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800, fontFamily: "monospace", flexShrink: 0,
                color: positive ? "#fbbf24" : "#f87171",
              }}>
                {positive ? "+" : ""}{t.amount.toLocaleString()} MW
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
