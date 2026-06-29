"use client";

import { useState } from "react";
import type { CompetitionMode, CompetitionDuration } from "@/types";
import { getSupabaseClient } from "@/lib/supabase";

interface CompetitionSetupProps {
  userId: string;
  onCreated: (competitionId: string) => void;
}

const DURATION_LABELS: Record<CompetitionDuration, string> = {
  "1d": "1 Day",
  "3d": "3 Days",
  "1w": "1 Week",
};

const DURATION_DAYS: Record<CompetitionDuration, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
};

export default function CompetitionSetup({ userId, onCreated }: CompetitionSetupProps) {
  const [mode, setMode] = useState<CompetitionMode>("solo");
  const [duration, setDuration] = useState<CompetitionDuration>("1d");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) { setError("Give your competition a name"); return; }
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + DURATION_DAYS[duration]);

    const { data: comp, error: compErr } = await supabase
      .from("competitions")
      .insert({
        name: name.trim(),
        creator_id: userId,
        mode,
        duration,
        starting_cash: 10000,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
      })
      .select()
      .single();

    if (compErr || !comp) {
      setError(compErr?.message ?? "Failed to create competition");
      setLoading(false);
      return;
    }

    // Add current user as participant
    const { error: partErr } = await supabase.from("competition_participants").insert({
      competition_id: comp.id,
      user_id: userId,
      cash_balance: 10000,
    });

    if (partErr) {
      setError(partErr.message);
      setLoading(false);
      return;
    }

    // Add all 3 bots if mode is "bot"
    if (mode === "bot") {
      await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: comp.id, startingCash: 10000 }),
      });
    }

    onCreated(comp.id);
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-text-primary">New Competition</h2>
        <p className="text-sm text-text-muted mt-1">Start with $10,000 in fake money. Who will make the most?</p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
          Competition Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. March Madness"
          className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-border-strong transition-colors"
        />
      </div>

      {/* Mode */}
      <div>
        <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
          Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["solo", "friends", "bot"] as CompetitionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-3 rounded-xl text-sm font-medium border transition-all capitalize
                ${mode === m
                  ? "bg-brand-teal-dim border-brand-teal text-brand-teal"
                  : "bg-bg-secondary border-border-dim text-text-muted hover:border-border-subtle"}`}
            >
              {m === "solo" ? "Solo" : m === "friends" ? "Friends" : "vs Bot"}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-2">
          {mode === "solo" && "Just you. Track your own returns over time."}
          {mode === "friends" && "Invite friends with a code. First to most profit wins."}
          {mode === "bot" && "Compete against a bot that tracks the S&P 500 index."}
        </p>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
          Duration
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["week", "month", "year"] as CompetitionDuration[]).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`py-3 rounded-xl text-sm font-medium border transition-all
                ${duration === d
                  ? "bg-brand-teal-dim border-brand-teal text-brand-teal"
                  : "bg-bg-secondary border-border-dim text-text-muted hover:border-border-subtle"}`}
            >
              {DURATION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-xs text-down bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-3.5 rounded-xl text-sm font-medium bg-brand-teal-dim border border-brand-teal text-brand-teal hover:bg-[rgba(125,211,176,0.2)] disabled:opacity-50 transition-all"
      >
        {loading ? "Creating..." : "Start Competition"}
      </button>
    </div>
  );
}
