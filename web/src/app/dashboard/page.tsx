"use client";

// ============================================================
// Bot Lab Dashboard
// Shows leaderboard, equity curves, daily/weekly summaries.
// Read-only. No auth required.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ────────────────────────────────────────────────────

interface BotRow {
  id: string;
  code: string;
  name: string;
  group_id: string;
  description: string;
}

interface SnapshotRow {
  bot_id: string;
  snapshot_date: string;
  total_value: number;
  cash_balance: number;
  portfolio_value: number;
  day_pnl: number;
  cumulative_return: number;
}

interface LeaderEntry {
  bot: BotRow;
  latestSnapshot: SnapshotRow | null;
  rank: number;
}

interface ChartPoint {
  date: string;
  value: number;
}

// ── Group colours ─────────────────────────────────────────────
const GROUP_COLOURS: Record<string, string> = {
  A: "#3b82f6", // blue
  B: "#10b981", // green
  C: "#f59e0b", // amber
  D: "#8b5cf6", // purple
  E: "#ef4444", // red
};

function groupBadge(groupId: string) {
  const colour = GROUP_COLOURS[groupId] ?? "#6b7280";
  return (
    <span
      style={{ backgroundColor: colour }}
      className="text-white text-xs font-bold px-2 py-0.5 rounded-full mr-2"
    >
      {groupId}
    </span>
  );
}

function pnlColour(v: number) {
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

function fmt(v: number, decimals = 2) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Mini sparkline (SVG) ──────────────────────────────────────
function Sparkline({ points, colour }: { points: ChartPoint[]; colour: string }) {
  if (points.length < 2) return <span className="text-gray-600 text-xs">no data</span>;

  const values = points.map(p => p.value);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;
  const W = 120, H = 36;

  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));

  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────
export default function DashboardPage() {
  const [bots, setBots]           = useState<BotRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [tab, setTab]             = useState<"leaderboard" | "equity">("leaderboard");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: botData }, { data: snapData }] = await Promise.all([
      supabase.from("bots").select("*").order("code"),
      supabase
        .from("bot_daily_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: true }),
    ]);
    setBots(botData ?? []);
    setSnapshots(snapData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build leaderboard from latest snapshot per bot
  const leaderboard: LeaderEntry[] = bots
    .map(bot => {
      const botSnaps = snapshots.filter(s => s.bot_id === bot.id);
      const latest   = botSnaps.length > 0 ? botSnaps[botSnaps.length - 1] : null;
      return { bot, latestSnapshot: latest, rank: 0 };
    })
    .sort((a, b) => {
      const av = a.latestSnapshot?.total_value ?? 1000;
      const bv = b.latestSnapshot?.total_value ?? 1000;
      return bv - av;
    })
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  // Equity chart data for selected bot
  const equityData: ChartPoint[] = selectedBot
    ? snapshots
        .filter(s => s.bot_id === selectedBot)
        .map(s => ({ date: s.snapshot_date, value: s.total_value }))
    : [];

  // Group averages
  const groupAverages = ["A", "B", "C", "D", "E"].map(g => {
    const entries = leaderboard.filter(e => e.bot.group_id === g && e.latestSnapshot);
    const avg = entries.length > 0
      ? entries.reduce((sum, e) => sum + (e.latestSnapshot!.cumulative_return), 0) / entries.length
      : 0;
    return { group: g, avg, count: entries.length };
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tradecraft Bot Lab</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {bots.length} bots · {loading ? "loading…" : `${snapshots.length} snapshots`}
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {/* Group summary bar */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {groupAverages.map(({ group, avg, count }) => (
          <div key={group} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <div className="flex items-center mb-1">
              {groupBadge(group)}
              <span className="text-gray-400 text-xs">{count} bots</span>
            </div>
            <p className={`text-lg font-bold ${pnlColour(avg)}`}>
              {avg >= 0 ? "+" : ""}{fmt(avg)}%
            </p>
            <p className="text-gray-500 text-xs">avg return</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["leaderboard", "equity"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm capitalize ${
              tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {tab === "leaderboard" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 w-8">#</th>
                <th className="text-left px-4 py-3">Bot</th>
                <th className="text-right px-4 py-3">Total Value</th>
                <th className="text-right px-4 py-3">Return</th>
                <th className="text-right px-4 py-3">Today P&L</th>
                <th className="text-right px-4 py-3">Cash</th>
                <th className="text-center px-4 py-3">Trend</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(({ bot, latestSnapshot, rank }) => {
                const snapHistory = snapshots
                  .filter(s => s.bot_id === bot.id)
                  .slice(-14); // last 14 days for sparkline
                const points = snapHistory.map(s => ({ date: s.snapshot_date, value: s.total_value }));
                const colour  = GROUP_COLOURS[bot.group_id] ?? "#6b7280";

                return (
                  <tr
                    key={bot.id}
                    onClick={() => { setSelectedBot(bot.id); setTab("equity"); }}
                    className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-gray-500">{rank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        {groupBadge(bot.group_id)}
                        <div>
                          <p className="font-semibold">{bot.code} — {bot.name}</p>
                          <p className="text-gray-500 text-xs">{bot.description?.slice(0, 60)}…</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      ${fmt(latestSnapshot?.total_value ?? 1000)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${pnlColour(latestSnapshot?.cumulative_return ?? 0)}`}>
                      {latestSnapshot ? `${latestSnapshot.cumulative_return >= 0 ? "+" : ""}${fmt(latestSnapshot.cumulative_return)}%` : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${pnlColour(latestSnapshot?.day_pnl ?? 0)}`}>
                      {latestSnapshot ? `${latestSnapshot.day_pnl >= 0 ? "+" : ""}$${fmt(latestSnapshot.day_pnl)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      ${fmt(latestSnapshot?.cash_balance ?? 1000)}
                    </td>
                    <td className="px-4 py-3 flex justify-center">
                      <Sparkline points={points} colour={colour} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Equity curve */}
      {tab === "equity" && (
        <div className="space-y-4">
          {/* Bot selector */}
          <div className="flex flex-wrap gap-2">
            {bots.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBot(b.id)}
                className={`px-3 py-1 rounded-lg text-xs font-mono ${
                  selectedBot === b.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {b.code}
              </button>
            ))}
          </div>

          {selectedBot && equityData.length > 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              {(() => {
                const bot      = bots.find(b => b.id === selectedBot)!;
                const colour   = GROUP_COLOURS[bot.group_id] ?? "#6b7280";
                const values   = equityData.map(p => p.value);
                const minV     = Math.min(...values);
                const maxV     = Math.max(...values);
                const range    = maxV - minV || 1;
                const W = 800, H = 240;
                const coords = values.map((v, i) => ({
                  x: (i / Math.max(values.length - 1, 1)) * W,
                  y: H - ((v - minV) / range) * (H - 20) - 10,
                }));
                const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
                const latestReturn = equityData[equityData.length - 1].value;

                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-bold">{bot.code} — {bot.name}</h2>
                        <p className="text-gray-500 text-sm">{bot.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${fmt(latestReturn)}</p>
                        <p className={`text-sm ${pnlColour(latestReturn - 1000)}`}>
                          {latestReturn >= 1000 ? "+" : ""}{fmt(((latestReturn / 1000) - 1) * 100)}% total return
                        </p>
                      </div>
                    </div>

                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                      {/* Baseline at $1,000 */}
                      <line
                        x1="0" y1={H - ((1000 - minV) / range) * (H - 20) - 10}
                        x2={W} y2={H - ((1000 - minV) / range) * (H - 20) - 10}
                        stroke="#374151" strokeWidth="1" strokeDasharray="4,4"
                      />
                      <path d={d} fill="none" stroke={colour} strokeWidth="2.5" strokeLinejoin="round" />
                      {/* Dots on first and last */}
                      <circle cx={coords[0].x} cy={coords[0].y} r="4" fill={colour} />
                      <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r="4" fill={colour} />
                    </svg>

                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                      <span>{equityData[0].date}</span>
                      <span>{equityData[equityData.length - 1].date}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center text-gray-500">
              {selectedBot ? "No snapshot data yet — bots need to run first." : "Select a bot above to view its equity curve."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
