"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { getSupabaseClient } from "@/lib/supabase";

interface Competition {
  id: string;
  name: string;
  mode: string;
  starting_cash: number;
  start_date: string;
  end_date: string;
  status: string;
  invite_code: string;
  participant_count: number;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function daysLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    // Check auth
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });

    // Load competition
    fetch(`/api/competitions/join?code=${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setCompetition(data.competition);
      })
      .catch(() => setError("Failed to load competition"))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleJoin() {
    if (!userId) {
      // Store intent and redirect to login
      localStorage.setItem("tc_join_redirect", `/join/${code}`);
      window.location.href = "/";
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/competitions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userId }),
      });
      const data = await res.json();
      if (!res.ok && !data.alreadyJoined) throw new Error(data.error ?? "Failed to join");
      setJoined(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#060a14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>

      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7dd3b0,#4ade80)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#060a14" }}>TC</div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>Tradecraft</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(232,234,240,0.58)" }}>Stock market trading game</div>
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 420, background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>

        {/* Card header */}
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7dd3b0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            You&apos;ve been invited to compete
          </div>

          {loading && (
            <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, color: "rgba(232,234,240,0.52)", fontSize: 13 }}>
              <div style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, height: "100%", background: "linear-gradient(90deg,transparent,#7dd3b0,transparent)", width: "40%", animation: "scan 1.4s ease-in-out infinite" }} />
              </div>
              <style>{`@keyframes scan { 0%{left:-40%} 100%{left:140%} }`}</style>
            </div>
          )}

          {competition && (
            <>
              <div style={{ fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 6 }}>
                {competition.name || "Tradecraft Competition"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(232,234,240,0.60)", fontFamily: "monospace" }}>
                Code: <span style={{ color: "#7dd3b0", letterSpacing: "0.1em" }}>{competition.invite_code}</span>
              </div>
            </>
          )}

          {error && !competition && (
            <div style={{ fontSize: 14, color: "#f87171", lineHeight: 1.5 }}>{error}</div>
          )}
        </div>

        {/* Competition stats */}
        {competition && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              ["Starting cash", formatCurrency(competition.starting_cash)],
              ["Players", String(competition.participant_count)],
              ["Days left", String(daysLeft(competition.end_date))],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: "16px 20px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: "white" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Mode badge */}
        {competition && (
          <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "capitalize",
              background: competition.mode === "friends" ? "rgba(125,211,176,0.1)" : "rgba(96,165,250,0.1)",
              color: competition.mode === "friends" ? "#7dd3b0" : "#60a5fa",
              border: `1px solid ${competition.mode === "friends" ? "rgba(125,211,176,0.2)" : "rgba(96,165,250,0.2)"}` }}>
              {competition.mode === "friends" ? "Friends" : competition.mode} mode
            </span>
            <span style={{ fontSize: 12, color: "rgba(232,234,240,0.52)" }}>
              {competition.mode === "friends" ? "Compete against friends with $" + competition.starting_cash.toLocaleString() + " virtual cash" : "Open competition"}
            </span>
          </div>
        )}

        {/* CTA */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {joined ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>You&apos;re in!</div>
              <div style={{ fontSize: 13, color: "rgba(232,234,240,0.60)" }}>Redirecting to your dashboard…</div>
            </div>
          ) : (
            <>
              {error && competition && (
                <div style={{ fontSize: 13, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                  {error}
                </div>
              )}

              {competition?.status !== "active" ? (
                <div style={{ textAlign: "center", fontSize: 14, color: "rgba(232,234,240,0.60)", padding: "8px 0" }}>
                  This competition has ended.
                </div>
              ) : (
                <button onClick={handleJoin} disabled={joining || !competition}
                  style={{ width: "100%", padding: "16px 0", borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: joining ? "wait" : "pointer",
                    opacity: !competition ? 0.4 : 1,
                    background: "linear-gradient(135deg,rgba(125,211,176,0.2),rgba(74,222,128,0.12))",
                    border: "1px solid rgba(125,211,176,0.35)", color: "#7dd3b0", transition: "all 0.2s",
                    boxShadow: "0 0 24px rgba(125,211,176,0.08)" }}>
                  {joining ? "Joining…" : userId ? "Join Competition →" : "Sign in to Join →"}
                </button>
              )}

              {!userId && competition && (
                <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", textAlign: "center", lineHeight: 1.6 }}>
                  You&apos;ll be redirected to sign in, then brought back here automatically.
                </div>
              )}

              <button onClick={() => window.location.href = "/dashboard"}
                style={{ width: "100%", padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: "transparent", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(232,234,240,0.52)" }}>
                Go to dashboard instead
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "rgba(232,234,240,0.60)" }}>
        Tradecraft · Virtual trading · Not financial advice
      </div>
    </div>
  );
}
