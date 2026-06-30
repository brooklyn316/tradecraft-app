"use client";

import { useState } from "react";
import type { CompetitionMode, CompetitionDuration, CompetitionStyle } from "@/types";
import { getSupabaseClient } from "@/lib/supabase";

interface CompetitionSetupProps {
  userId: string;
  onCreated: (competitionId: string) => void;
}

const DURATION_LABELS: Record<CompetitionDuration, string> = {
  "1h": "1 Hour",
  "6h": "6 Hours",
  "1d": "1 Day",
  "3d": "3 Days",
  "1w": "1 Week",
};

const DURATION_HOURS: Record<CompetitionDuration, number> = {
  "1h": 1,
  "6h": 6,
  "1d": 24,
  "3d": 72,
  "1w": 168,
};

const BOTS = [
  {
    id: "index",
    name: "The Indexer",
    emoji: "🏦",
    tagline: "Slow. Steady. Deadly.",
    description: "Rebalances blue-chips every cycle. Boring — until you're losing to it.",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.1)",
    border: "rgba(96,165,250,0.2)",
    difficulty: "Medium",
  },
  {
    id: "momentum",
    name: "Surge",
    emoji: "⚡",
    tagline: "Chases winners. Cuts losers fast.",
    description: "Buys the top daily gainers and dumps anything falling. Never hesitates.",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
    difficulty: "Hard",
  },
  {
    id: "chaos",
    name: "Wildcard",
    emoji: "🎲",
    tagline: "Completely unpredictable.",
    description: "Trades randomly. Somehow it keeps winning — and that's the scary part.",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.1)",
    border: "rgba(167,139,250,0.2)",
    difficulty: "Unknown",
  },
];

export default function CompetitionSetup({ userId, onCreated }: CompetitionSetupProps) {
  const [mode, setMode]           = useState<CompetitionMode>("bot");
  const [style, setStyle]         = useState<CompetitionStyle>("standard");
  const [duration, setDuration]   = useState<CompetitionDuration>("1w");
  const [roundDuration, setRoundDuration] = useState("1h");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) { setError("Give your competition a name"); return; }
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setTime(endDate.getTime() + DURATION_HOURS[duration] * 60 * 60 * 1000);

    const { data: comp, error: compErr } = await supabase
      .from("competitions")
      .insert({
        name: name.trim(),
        creator_id: userId,
        mode,
        style,
        duration: style === "day_trade" ? "1d" : duration,
        starting_cash: 10000,
        start_date: startDate.toISOString(),
        end_date:   endDate.toISOString(),
      })
      .select()
      .single();

    if (compErr || !comp) {
      setError(compErr?.message ?? "Failed to create competition");
      setLoading(false);
      return;
    }

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

    if (mode === "bot") {
      await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: comp.id, startingCash: 10000 }),
      });
    }

    // Bracket: immediately seed round 1
    if (style === "bracket") {
      await fetch("/api/bracket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", competitionId: comp.id, roundDuration }),
      });
    }

    onCreated(comp.id);
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-7 max-w-lg mx-auto">

      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-white">New Competition</h2>
        <p className="text-sm text-[rgba(232,234,240,0.55)] mt-1">
          $10,000 virtual cash. Real stock prices. One winner.
        </p>
      </div>

      {/* Competition name */}
      <div>
        <label className="block text-[10px] font-semibold text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">
          Competition name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. March Madness"
          className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.25)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-colors"
        />
      </div>

      {/* Style */}
      <div>
        <label className="block text-[10px] font-semibold text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">
          Trading Style
        </label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {([
            { id: "standard",  label: "Standard",      icon: "📊", desc: "No restrictions. Hold as long as you want." },
            { id: "day_trade", label: "Day Trade",     icon: "⚡", desc: "Must close all positions by 4pm ET daily. Forces tight P&L discipline." },
            { id: "swing",     label: "Swing",         icon: "📈", desc: "Multi-day holds. Positions labelled by how long you've held." },
            { id: "bracket",   label: "Bracket",       icon: "🏆", desc: "Head-to-head elimination rounds. Best return advances." },
            { id: "crypto",    label: "Crypto Blitz",  icon: "₿",  desc: "Trade BTC, ETH, SOL and 17 more. Runs 24/7 — no market hours." },
          ] as { id: CompetitionStyle; label: string; icon: string; desc: string }[]).map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className="py-3 rounded-xl text-sm font-medium border transition-all flex flex-col items-center gap-1"
              style={{
                background: style === s.id ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
                borderColor: style === s.id ? "rgba(125,211,176,0.4)" : "rgba(255,255,255,0.07)",
                color: style === s.id ? "#7dd3b0" : "rgba(232,234,240,0.5)",
              }}
            >
              <span className="text-lg">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {style === "day_trade" && (
          <div className="rounded-xl border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.05)] p-3 text-[11px] text-[rgba(232,234,240,0.6)] leading-relaxed">
            ⚡ <strong className="text-[#f87171]">Day Trade rules:</strong> All positions auto-close at 3:58pm ET. Competition locks to 1 day. No overnight holds — your entire P&L is settled by close.
          </div>
        )}
        {style === "swing" && (
          <div className="rounded-xl border border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.05)] p-3 text-[11px] text-[rgba(232,234,240,0.6)] leading-relaxed">
            📈 <strong className="text-[#60a5fa]">Swing rules:</strong> Hold positions across multiple days. Each holding shows how long you've owned it. Reward patience.
          </div>
        )}
        {style === "crypto" && (
          <div className="rounded-xl border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.05)] p-3 text-[11px] text-[rgba(232,234,240,0.6)] leading-relaxed">
            <p className="mb-2">₿ <strong className="text-[#fbbf24]">Crypto Blitz:</strong> Trade Bitcoin, Ethereum, Solana, Dogecoin and 16 more coins. Markets never close — play any time, any day.</p>
            <div className="flex gap-2 mt-2">
              {(["1h","6h","1d","3d"] as const).map((k) => (
                <button key={k} onClick={() => setDuration(k)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                  style={{
                    background: duration === k ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: duration === k ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.08)",
                    color: duration === k ? "#fbbf24" : "rgba(232,234,240,0.45)",
                  }}>{DURATION_LABELS[k]}</button>
              ))}
            </div>
            <p className="text-[9px] mt-2 text-[rgba(232,234,240,0.35)]">Prices via CoinGecko · updated every minute</p>
          </div>
        )}
        {style === "bracket" && (
          <div className="rounded-xl border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.05)] p-3 text-[11px] text-[rgba(232,234,240,0.6)] leading-relaxed">
            <p className="mb-2">🏆 <strong className="text-[#fbbf24]">Bracket rules:</strong> You vs 3 bots in a 2-round knockout. Each round is a clean slate — cash resets, no holdings carry over. Highest % return advances.</p>
            <div className="flex gap-2 mt-2">
              {[["15min","15 min"],["1h","1 hour"],["4h","4 hours"],["1d","1 day"]].map(([k,l]) => (
                <button key={k} onClick={() => setRoundDuration(k)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                  style={{
                    background: roundDuration === k ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: roundDuration === k ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.08)",
                    color: roundDuration === k ? "#fbbf24" : "rgba(232,234,240,0.45)",
                  }}>{l}</button>
              ))}
            </div>
            <p className="text-[9px] mt-2 text-[rgba(232,234,240,0.35)]">Time per round · 2 rounds total (Semifinal + Final)</p>
          </div>
        )}
      </div>

      {/* Mode */}
      <div>
        <label className="block text-[10px] font-semibold text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-3">
          Mode
        </label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([
            { id: "bot",     label: "vs AI",   icon: "🤖" },
            { id: "friends", label: "Friends", icon: "👥" },
            { id: "solo",    label: "Solo",    icon: "📊" },
          ] as { id: CompetitionMode; label: string; icon: string }[]).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="py-3 rounded-xl text-sm font-medium border transition-all flex flex-col items-center gap-1"
              style={{
                background: mode === m.id ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
                borderColor: mode === m.id ? "rgba(125,211,176,0.4)" : "rgba(255,255,255,0.07)",
                color: mode === m.id ? "#7dd3b0" : "rgba(232,234,240,0.5)",
              }}
            >
              <span className="text-lg">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {mode === "bot" && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold text-[rgba(232,234,240,0.4)] uppercase tracking-widest mb-3">
              You'll face all three simultaneously
            </p>
            {BOTS.map((bot) => (
              <div
                key={bot.id}
                className="rounded-xl border p-3.5 transition-colors"
                style={{ background: bot.glow, borderColor: bot.border }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl w-9 flex-shrink-0 text-center">{bot.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white">{bot.name}</span>
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ color: bot.color, background: `${bot.color}20` }}
                      >
                        {bot.difficulty}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium" style={{ color: bot.color }}>{bot.tagline}</p>
                    <p className="text-[11px] text-[rgba(232,234,240,0.5)] mt-0.5 leading-relaxed">{bot.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === "friends" && (
          <div className="rounded-xl border border-[rgba(125,211,176,0.15)] bg-[rgba(125,211,176,0.05)] p-4 text-sm text-[rgba(232,234,240,0.6)] leading-relaxed">
            You'll get a shareable invite code after creating the competition. Send it to anyone — they join and trade against you live.
          </div>
        )}

        {mode === "solo" && (
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[rgba(232,234,240,0.6)] leading-relaxed">
            No opponents — just you tracking your own returns. Good for practising strategies before challenging the bots.
          </div>
        )}
      </div>

      {/* Duration — hidden for day_trade, bracket, and crypto (crypto has inline picker) */}
      <div style={{ display: (style === "day_trade" || style === "bracket" || style === "crypto") ? "none" : undefined }}>
        <label className="block text-[10px] font-semibold text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">
          Duration
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["1d", "3d", "1w"] as CompetitionDuration[]).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className="py-3 rounded-xl text-sm font-medium border transition-all"
              style={{
                background: duration === d ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.03)",
                borderColor: duration === d ? "rgba(125,211,176,0.4)" : "rgba(255,255,255,0.07)",
                color: duration === d ? "#7dd3b0" : "rgba(232,234,240,0.5)",
              }}
            >
              {DURATION_LABELS[d]}
            </button>
          ))}
        </div>
        {mode === "bot" && (
          <p className="text-[10px] text-[rgba(232,234,240,0.38)] mt-2">
            {duration === "1d" && "One day. Fast and brutal — every trade counts from the start."}
            {duration === "3d" && "Three days. Enough for strategy to play out, short enough to stay sharp."}
            {duration === "1w" && "Recommended. A full week — the bots will compound hard. You'll need to stay ahead."}
          </p>
        )}
      </div>

      {error && (
        <div className="text-xs text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-xl px-4 py-3">
          ⚠ {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-4 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #7dd3b0, #4ade80)",
          color: "#060a14",
          boxShadow: "0 8px 24px rgba(125,211,176,0.2)",
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-[#060a14] border-t-transparent rounded-full animate-spin" />
            Setting up competition…
          </span>
        ) : (
          mode === "bot"     ? "Accept the challenge →" :
          mode === "friends" ? "Create & get invite code →" :
          "Start solo →"
        )}
      </button>
    </div>
  );
}
