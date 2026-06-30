"use client";

import { useCallback, useEffect, useState } from "react";

interface Challenge {
  id: string;
  date: string;
  title: string;
  description: string;
  challenge_type: string;
  target_value: number;
  reward_cash: number;
  emoji?: string;
}

interface Completion {
  id: string;
  completed_at: string;
  reward_granted: number;
}

interface DailyChallengeProps {
  participantId: string;
  startingCash: number;
}

const CHALLENGE_EMOJIS: Record<string, string> = {
  trade_count:      "⚡",
  big_single_trade: "💰",
  diversify:        "🌐",
  portfolio_gain:   "🐂",
  buy_volume:       "📊",
  short_sell:       "🐻",
  options_trade:    "🎯",
};

function formatProgress(type: string, progress: number, target: number): string {
  switch (type) {
    case "trade_count":
      return `${Math.min(progress, target).toFixed(0)} / ${target} trades`;
    case "big_single_trade":
      return `$${Math.min(progress, target).toLocaleString("en-US", { maximumFractionDigits: 0 })} / $${target.toLocaleString()} single trade`;
    case "diversify":
      return `${Math.min(progress, target).toFixed(0)} / ${target} stocks held`;
    case "portfolio_gain":
      return `${progress.toFixed(2)}% / ${target}% gain`;
    case "buy_volume":
      return `$${Math.min(progress, target).toLocaleString("en-US", { maximumFractionDigits: 0 })} / $${target.toLocaleString()} traded`;
    case "short_sell":
      return progress >= target ? "Short opened ✓" : "No short yet";
    case "options_trade":
      return progress >= target ? "Option bought ✓" : "No options yet";
    default:
      return `${progress} / ${target}`;
  }
}

function progressPct(type: string, progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, (progress / target) * 100);
}

export default function DailyChallenge({ participantId }: DailyChallengeProps) {
  const [challenge,   setChallenge]   = useState<Challenge | null>(null);
  const [completion,  setCompletion]  = useState<Completion | null>(null);
  const [progress,    setProgress]    = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [justDone,    setJustDone]    = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/daily-challenge?participantId=${participantId}`);
      if (!res.ok) return;
      const { challenge: c, completion: comp, progress: prog } = await res.json();
      const wasCompleted = !!completion;
      setChallenge(c);
      setCompletion(comp ?? null);
      setProgress(prog ?? 0);
      if (!wasCompleted && comp) setJustDone(true);
    } finally {
      setLoading(false);
    }
  }, [participantId, completion]);

  useEffect(() => {
    fetch_();
    const t = setInterval(fetch_, 30_000);
    return () => clearInterval(t);
  }, [fetch_]);

  useEffect(() => {
    if (justDone) {
      const t = setTimeout(() => setJustDone(false), 4000);
      return () => clearTimeout(t);
    }
  }, [justDone]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        Loading challenge…
      </div>
    );
  }

  if (!challenge) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(232,234,240,0.35)", fontSize: 12 }}>
        No challenge today
      </div>
    );
  }

  const done = !!completion;
  const pct  = progressPct(challenge.challenge_type, progress, challenge.target_value);
  const emoji = CHALLENGE_EMOJIS[challenge.challenge_type] ?? "🎯";

  // Format today's date nicely
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ padding: "14px 14px" }}>
      <style>{`
        @keyframes dc-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
        @keyframes dc-pulse   { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      {/* Date header */}
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
        {todayLabel}
      </div>

      {/* Challenge card */}
      <div style={{
        padding: "16px",
        borderRadius: 14,
        border: done
          ? "1px solid rgba(74,222,128,0.3)"
          : "1px solid rgba(125,211,176,0.18)",
        background: done
          ? "rgba(74,222,128,0.05)"
          : "rgba(125,211,176,0.03)",
        position: "relative",
        overflow: "hidden",
      }}>

        {/* Done glow */}
        {done && (
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.1) 0%, transparent 70%)",
          }} />
        )}

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{
            fontSize: 26,
            animation: justDone ? "dc-bounce 0.6s ease 3" : "none",
            lineHeight: 1,
            flexShrink: 0,
          }}>
            {done ? "✅" : emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: done ? "#4ade80" : "rgba(232,234,240,0.9)" }}>
                {challenge.title}
              </span>
              <span style={{
                fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
                background: "rgba(125,211,176,0.1)", color: "#7dd3b0",
                letterSpacing: "0.06em",
              }}>DAILY</span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.55)", lineHeight: 1.4 }}>
              {challenge.description}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {!done && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(232,234,240,0.45)" }}>
                {formatProgress(challenge.challenge_type, progress, challenge.target_value)}
              </span>
              <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: pct >= 70 ? "#fbbf24" : "rgba(232,234,240,0.4)" }}>
                {pct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${pct}%`,
                background: pct >= 100
                  ? "#4ade80"
                  : pct >= 70
                    ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
                    : "linear-gradient(90deg,#7dd3b0,#4ade80)",
                transition: "width 0.5s ease",
                animation: pct >= 70 && pct < 100 ? "dc-pulse 1.5s ease-in-out infinite" : "none",
              }} />
            </div>
          </div>
        )}

        {/* Completed state */}
        {done && (
          <div style={{
            padding: "8px 10px",
            background: "rgba(74,222,128,0.08)",
            borderRadius: 8,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>🎉</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80" }}>
                Challenge complete! +${completion.reward_granted.toLocaleString()} cash
              </div>
              <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", marginTop: 1 }}>
                Credited {new Date(completion.completed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          </div>
        )}

        {/* Reward pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>Reward</span>
            <span style={{
              fontSize: 11, fontWeight: 800, fontFamily: "monospace",
              color: done ? "#4ade80" : "#fbbf24",
              padding: "2px 7px", borderRadius: 4,
              background: done ? "rgba(74,222,128,0.1)" : "rgba(251,191,36,0.1)",
            }}>
              +${challenge.reward_cash.toLocaleString()}
            </span>
          </div>
          {!done && pct > 0 && (
            <span style={{ fontSize: 9, color: "rgba(232,234,240,0.35)" }}>
              Auto-claimed on completion
            </span>
          )}
        </div>
      </div>

      {/* Context */}
      <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          How it works
        </div>
        <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", lineHeight: 1.5 }}>
          Complete the daily challenge in any active competition to earn the cash reward, credited instantly to your balance. Challenges reset every day at midnight UTC.
        </div>
      </div>
    </div>
  );
}
