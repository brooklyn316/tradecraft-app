"use client";

import { useCallback, useEffect, useState } from "react";
import { BADGE_CATALOGUE } from "@/lib/badges";

interface Streak {
  current_streak:      number;
  longest_streak:      number;
  last_challenge_date: string | null;
}

interface Badge {
  badge_type: string;
  earned_at:  string;
  metadata:   Record<string, unknown> | null;
}

interface StreakBadgesProps {
  userId:        string;
  participantId: string;
}

export default function StreakBadges({ userId, participantId }: StreakBadgesProps) {
  const [streak,         setStreak]         = useState<Streak>({ current_streak: 0, longest_streak: 0, last_challenge_date: null });
  const [badges,         setBadges]         = useState<Badge[]>([]);
  const [challengeCount, setChallengeCount] = useState(0);
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/streaks-badges?userId=${userId}&participantId=${participantId}`);
      if (!res.ok) return;
      const { streak: s, badges: b, challengeCount: c } = await res.json();
      setStreak(s);
      setBadges(b ?? []);
      setChallengeCount(c ?? 0);
    } finally {
      setLoading(false);
    }
  }, [userId, participantId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const earnedSet = new Set(badges.map(b => b.badge_type));

  const streakColor =
    streak.current_streak >= 7  ? "#f59e0b" :
    streak.current_streak >= 3  ? "#f97316" :
    streak.current_streak >= 1  ? "#fb923c" : "rgba(232,234,240,0.3)";

  if (loading) return null;

  return (
    <div style={{ padding: "12px 14px 14px" }}>

      {/* ── Streak display ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px",
        background: streak.current_streak > 0 ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${streak.current_streak > 0 ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 12,
        marginBottom: 14,
      }}>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>
            {streak.current_streak === 0 ? "💤" : "🔥"}
          </div>
          <div style={{
            fontSize: 20, fontWeight: 900, fontFamily: "monospace",
            color: streakColor, lineHeight: 1, marginTop: 2,
          }}>
            {streak.current_streak}
          </div>
          <div style={{ fontSize: 8, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            day streak
          </div>
        </div>

        <div style={{ flex: 1, borderLeft: "1px solid rgba(255,255,255,0.07)", paddingLeft: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Best</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "#fbbf24" }}>
                {streak.longest_streak}d
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Challenges</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "#7dd3b0" }}>
                {challengeCount}
              </div>
            </div>
          </div>

          {streak.current_streak === 0 && (
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>
              Complete today&apos;s challenge to start a streak
            </div>
          )}
          {streak.current_streak > 0 && streak.current_streak < 3 && (
            <div style={{ fontSize: 10, color: "rgba(249,115,22,0.7)" }}>
              {3 - streak.current_streak} more day{3 - streak.current_streak > 1 ? "s" : ""} to earn 🔥 On Fire badge
            </div>
          )}
          {streak.current_streak >= 3 && streak.current_streak < 7 && (
            <div style={{ fontSize: 10, color: "rgba(249,115,22,0.7)" }}>
              {7 - streak.current_streak} more day{7 - streak.current_streak > 1 ? "s" : ""} to earn 🌟 Week Warrior
            </div>
          )}
          {streak.current_streak >= 7 && (
            <div style={{ fontSize: 10, color: "#fbbf24" }}>
              Incredible streak — keep it going!
            </div>
          )}
        </div>
      </div>

      {/* ── Badge grid ── */}
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        Badges — {earnedSet.size} / {BADGE_CATALOGUE.length}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {BADGE_CATALOGUE.map(badge => {
          const earned = earnedSet.has(badge.type);
          const earnedBadge = badges.find(b => b.badge_type === badge.type);
          return (
            <div key={badge.type} style={{
              padding: "8px 6px",
              borderRadius: 10,
              border: `1px solid ${earned ? "rgba(125,211,176,0.25)" : "rgba(255,255,255,0.05)"}`,
              background: earned ? "rgba(125,211,176,0.05)" : "rgba(255,255,255,0.02)",
              textAlign: "center",
              opacity: earned ? 1 : 0.45,
              transition: "all 0.2s",
              cursor: "default",
            }}
              title={earned
                ? `Earned ${new Date(earnedBadge!.earned_at).toLocaleDateString()}`
                : `Locked — ${badge.desc}`}
            >
              <div style={{ fontSize: 20, marginBottom: 3, filter: earned ? "none" : "grayscale(100%)" }}>
                {badge.emoji}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: earned ? "rgba(232,234,240,0.85)" : "rgba(232,234,240,0.4)", lineHeight: 1.2 }}>
                {badge.label}
              </div>
              {earned && (
                <div style={{ fontSize: 7, color: "rgba(125,211,176,0.6)", marginTop: 2 }}>
                  ✓ earned
                </div>
              )}
              {!earned && (
                <div style={{ fontSize: 7, color: "rgba(232,234,240,0.25)", marginTop: 2 }}>
                  🔒
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
