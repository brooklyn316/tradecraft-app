"use client";

import { useCallback, useEffect, useState } from "react";
import type { GlobalEntry } from "@/app/api/global-leaderboard/route";

interface GlobalLeaderboardProps {
  currentUserId: string | null;
}

type SortKey = "best_return_pct" | "avg_return_pct" | "wins" | "total_pnl" | "badge_count";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "best_return_pct", label: "Best Return" },
  { key: "avg_return_pct",  label: "Avg Return"  },
  { key: "wins",            label: "Wins"         },
  { key: "total_pnl",       label: "Total P&L"   },
  { key: "badge_count",     label: "Badges"       },
];

function rankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function GlobalLeaderboard({ currentUserId }: GlobalLeaderboardProps) {
  const [entries,  setEntries]  = useState<GlobalEntry[]>([]);
  const [sortKey,  setSortKey]  = useState<SortKey>("best_return_pct");
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/global-leaderboard");
      if (!res.ok) return;
      const { entries: e } = await res.json();
      setEntries(e ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = [...entries].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return bv - av;
  }).map((e, i) => ({ ...e, displayRank: i + 1 }));

  const myEntry = sorted.find(e => e.user_id === currentUserId);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        Loading global rankings…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🌍</div>
        <div style={{ fontSize: 13, color: "rgba(232,234,240,0.5)" }}>No global data yet</div>
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", marginTop: 4 }}>
          Complete a competition to appear on the global leaderboard
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(232,234,240,0.9)" }}>🌍 Global Rankings</div>
            <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>{entries.length} traders ranked</div>
          </div>
          {myEntry && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)" }}>Your rank</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#7dd3b0" }}>
                {rankMedal(myEntry.displayRank)}
              </div>
            </div>
          )}
        </div>

        {/* Sort tabs */}
        <div style={{ display: "flex", gap: 3, overflowX: "auto", scrollbarWidth: "none" }}>
          {SORT_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setSortKey(opt.key)} style={{
              padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer",
              flexShrink: 0, border: "1px solid",
              background: sortKey === opt.key ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
              borderColor: sortKey === opt.key ? "rgba(125,211,176,0.35)" : "rgba(255,255,255,0.06)",
              color: sortKey === opt.key ? "#7dd3b0" : "rgba(232,234,240,0.4)",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* My entry pinned at top if not in top 10 */}
      {myEntry && myEntry.displayRank > 10 && (
        <div style={{
          padding: "8px 14px",
          background: "rgba(125,211,176,0.06)",
          borderBottom: "1px solid rgba(125,211,176,0.15)",
        }}>
          <EntryRow entry={myEntry} isMe sortKey={sortKey} />
        </div>
      )}

      {/* Leaderboard rows */}
      <div>
        {sorted.slice(0, 50).map(entry => (
          <EntryRow
            key={entry.user_id}
            entry={entry}
            isMe={entry.user_id === currentUserId}
            sortKey={sortKey}
          />
        ))}
      </div>
    </div>
  );
}

function EntryRow({ entry, isMe, sortKey }: { entry: GlobalEntry & { displayRank: number }; isMe: boolean; sortKey: SortKey }) {
  const isTop3 = entry.displayRank <= 3;

  const primaryValue = (() => {
    switch (sortKey) {
      case "best_return_pct": return `${entry.best_return_pct >= 0 ? "+" : ""}${entry.best_return_pct.toFixed(2)}%`;
      case "avg_return_pct":  return `${entry.avg_return_pct  >= 0 ? "+" : ""}${entry.avg_return_pct.toFixed(2)}%`;
      case "wins":            return `${entry.wins}W`;
      case "total_pnl":       return `${entry.total_pnl >= 0 ? "+" : ""}$${Math.abs(entry.total_pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
      case "badge_count":     return `${entry.badge_count} 🏅`;
    }
  })();

  const isPositive = (() => {
    switch (sortKey) {
      case "best_return_pct": return entry.best_return_pct >= 0;
      case "avg_return_pct":  return entry.avg_return_pct  >= 0;
      case "total_pnl":       return entry.total_pnl >= 0;
      default: return true;
    }
  })();

  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      background: isMe
        ? "rgba(125,211,176,0.04)"
        : isTop3
          ? "rgba(251,191,36,0.02)"
          : "transparent",
    }}>
      {/* Rank */}
      <div style={{ width: 32, flexShrink: 0, textAlign: "center" }}>
        {isTop3 ? (
          <span style={{ fontSize: 14 }}>{rankMedal(entry.displayRank)}</span>
        ) : (
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.35)" }}>
            #{entry.displayRank}
          </span>
        )}
      </div>

      {/* Name + badges */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: isMe ? "#7dd3b0" : "rgba(232,234,240,0.85)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {entry.username}
          </span>
          {isMe && (
            <span style={{ fontSize: 8, color: "#7dd3b0", fontWeight: 800, padding: "1px 4px", background: "rgba(125,211,176,0.12)", borderRadius: 3 }}>
              YOU
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 9, color: "rgba(232,234,240,0.35)" }}>
            {entry.total_comps} comp{entry.total_comps !== 1 ? "s" : ""}
          </span>
          {entry.wins > 0 && (
            <span style={{ fontSize: 9, color: "#fbbf24" }}>
              {entry.wins}🏆
            </span>
          )}
          {entry.current_streak > 0 && (
            <span style={{ fontSize: 9, color: "#f97316" }}>
              🔥{entry.current_streak}
            </span>
          )}
          {entry.badge_count > 0 && (
            <span style={{ fontSize: 9, color: "rgba(232,234,240,0.4)" }}>
              {entry.badge_count}🏅
            </span>
          )}
        </div>
      </div>

      {/* Primary value */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 800, fontFamily: "monospace",
          color: isPositive ? "#4ade80" : "#f87171",
        }}>
          {primaryValue}
        </div>
        {sortKey === "best_return_pct" && (
          <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>
            avg {entry.avg_return_pct >= 0 ? "+" : ""}{entry.avg_return_pct.toFixed(1)}%
          </div>
        )}
        {sortKey === "avg_return_pct" && (
          <div style={{ fontSize: 9, color: "rgba(232,234,240,0.35)", marginTop: 1 }}>
            best {entry.best_return_pct >= 0 ? "+" : ""}{entry.best_return_pct.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}
