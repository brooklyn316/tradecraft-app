"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { StockPrice } from "@/types";

interface BracketRound {
  id: string;
  round_number: number;
  round_name: string;
  round_duration: string;
  start_at: string;
  end_at: string;
  status: "pending" | "active" | "complete";
}

interface BracketMatchup {
  id: string;
  round_id: string;
  slot: number;
  participant_a: string;
  participant_b: string | null;
  return_a: number | null;
  return_b: number | null;
  winner_id: string | null;
  is_bye: boolean;
}

interface Participant {
  id: string;
  is_bot: boolean;
  bot_strategy: string | null;
  cash_balance: number;
  username: string;
}

interface BracketViewProps {
  competitionId: string;
  currentUserId: string | null;
  startingCash: number;
  stocks: StockPrice[];
}

const BOT_NAMES: Record<string, string> = {
  index: "The Indexer",
  momentum: "Surge",
  random: "Wildcard",
};

function useRoundCountdown(endAt: string) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(endAt).getTime() - Date.now());
      if (diff === 0) { setLabel("Ending…"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) setLabel(`${h}h ${m}m`);
      else if (m > 0) setLabel(`${m}m ${s.toString().padStart(2,"0")}s`);
      else setLabel(`${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [endAt]);
  return label;
}

function RoundCountdown({ endAt, status }: { endAt: string; status: string }) {
  const label = useRoundCountdown(endAt);
  if (status !== "active") return null;
  const urgent = new Date(endAt).getTime() - Date.now() < 120_000;
  return (
    <span style={{ fontFamily: "monospace", color: urgent ? "#f87171" : "#fbbf24",
      animation: urgent ? "pulse 1s ease-in-out infinite" : "none" }}>
      {label}
    </span>
  );
}

export default function BracketView({ competitionId, currentUserId, startingCash, stocks }: BracketViewProps) {
  const supabase = getSupabaseClient();
  const [rounds, setRounds]     = useState<BracketRound[]>([]);
  const [matchups, setMatchups] = useState<BracketMatchup[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [holdings, setHoldings] = useState<{ participant_id: string; symbol: string; shares: number; avg_cost: number }[]>([]);

  const load = useCallback(async () => {
    const [{ data: r }, { data: m }, { data: p }, { data: h }] = await Promise.all([
      supabase.from("bracket_rounds").select("*").eq("competition_id", competitionId).order("round_number"),
      supabase.from("bracket_matchups").select("*").eq("competition_id", competitionId).order("slot"),
      supabase.from("competition_participants").select("id, is_bot, bot_strategy, cash_balance, profiles(username)").eq("competition_id", competitionId),
      supabase.from("holdings").select("participant_id, symbol, shares, avg_cost")
        .in("participant_id", (await supabase.from("competition_participants").select("id").eq("competition_id", competitionId)).data?.map((x: any) => x.id) ?? []),
    ]);
    setRounds((r ?? []) as BracketRound[]);
    setMatchups((m ?? []) as BracketMatchup[]);
    setParticipants(((p ?? []) as any[]).map(x => ({
      id:           x.id,
      is_bot:       x.is_bot,
      bot_strategy: x.bot_strategy,
      cash_balance: x.cash_balance,
      username:     x.is_bot ? (BOT_NAMES[x.bot_strategy] ?? "Bot") : ((x.profiles as any)?.username ?? "You"),
    })));
    setHoldings((h ?? []) as any[]);
  }, [competitionId, supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.price]));

  function liveReturn(pid: string): number {
    const p = participants.find(x => x.id === pid);
    if (!p) return 0;
    const holdVal = holdings.filter(h => h.participant_id === pid)
      .reduce((s, h) => s + h.shares * (priceMap[h.symbol] ?? h.avg_cost), 0);
    return ((p.cash_balance + holdVal - startingCash) / startingCash) * 100;
  }

  function participantName(pid: string | null): string {
    if (!pid) return "TBD";
    return participants.find(x => x.id === pid)?.username ?? "?";
  }

  function isMe(pid: string | null): boolean {
    if (!pid || !currentUserId) return false;
    return participants.find(x => x.id === pid)?.is_bot === false;
  }

  const activeRound = rounds.find(r => r.status === "active");

  if (rounds.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
        <div style={{ fontSize: 13, color: "rgba(232,234,240,0.4)" }}>Tournament bracket loading…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>

      {/* Round header */}
      {activeRound && (
        <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24" }}>🏆 {activeRound.round_name}</div>
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.45)", marginTop: 2 }}>Round ends in</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            <RoundCountdown endAt={activeRound.end_at} status={activeRound.status} />
          </div>
        </div>
      )}

      {/* Bracket rounds */}
      {rounds.map(round => {
        const roundMatchups = matchups.filter(m => m.round_id === round.id);
        return (
          <div key={round.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: round.status === "active" ? "#fbbf24" : round.status === "complete" ? "#4ade80" : "rgba(232,234,240,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {round.round_name}
              </div>
              <div style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 700,
                background: round.status === "active" ? "rgba(251,191,36,0.12)" : round.status === "complete" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)",
                color: round.status === "active" ? "#fbbf24" : round.status === "complete" ? "#4ade80" : "rgba(232,234,240,0.3)" }}>
                {round.status.toUpperCase()}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roundMatchups.map(m => {
                const aReturn = round.status === "active" ? liveReturn(m.participant_a) : (m.return_a ?? 0);
                const bReturn = m.participant_b && (round.status === "active" ? liveReturn(m.participant_b) : (m.return_b ?? 0));
                const aWins   = m.winner_id === m.participant_a;
                const bWins   = m.winner_id === m.participant_b;
                const aLeading = typeof bReturn === "number" && aReturn > bReturn;
                const bLeading = typeof bReturn === "number" && (bReturn as number) > aReturn;

                return (
                  <div key={m.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
                    {/* Participant A */}
                    <div style={{
                      display: "flex", alignItems: "center", padding: "10px 14px",
                      background: aWins ? "rgba(74,222,128,0.06)" : round.status === "active" && aLeading ? "rgba(74,222,128,0.03)" : "transparent",
                      borderBottom: m.participant_b ? "1px solid rgba(255,255,255,0.05)" : "none",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isMe(m.participant_a) ? "#7dd3b0" : "rgba(232,234,240,0.85)" }}>
                            {participantName(m.participant_a)}
                          </span>
                          {isMe(m.participant_a) && <span style={{ fontSize: 8, color: "#7dd3b0", fontWeight: 800, padding: "1px 4px", background: "rgba(125,211,176,0.12)", borderRadius: 3 }}>YOU</span>}
                          {aWins && <span style={{ fontSize: 9, color: "#4ade80" }}>✓ ADV</span>}
                          {round.status === "active" && aLeading && !aWins && <span style={{ fontSize: 9, color: "rgba(74,222,128,0.6)" }}>leading</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: aReturn >= 0 ? "#4ade80" : "#f87171", opacity: m.is_bye ? 0.4 : 1 }}>
                        {!m.is_bye ? `${aReturn >= 0 ? "+" : ""}${aReturn.toFixed(2)}%` : "BYE"}
                      </div>
                    </div>

                    {/* Participant B */}
                    {m.participant_b && (
                      <div style={{
                        display: "flex", alignItems: "center", padding: "10px 14px",
                        background: bWins ? "rgba(74,222,128,0.06)" : round.status === "active" && bLeading ? "rgba(74,222,128,0.03)" : "transparent",
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isMe(m.participant_b) ? "#7dd3b0" : "rgba(232,234,240,0.85)" }}>
                              {participantName(m.participant_b)}
                            </span>
                            {isMe(m.participant_b) && <span style={{ fontSize: 8, color: "#7dd3b0", fontWeight: 800, padding: "1px 4px", background: "rgba(125,211,176,0.12)", borderRadius: 3 }}>YOU</span>}
                            {bWins && <span style={{ fontSize: 9, color: "#4ade80" }}>✓ ADV</span>}
                            {round.status === "active" && bLeading && !bWins && <span style={{ fontSize: 9, color: "rgba(74,222,128,0.6)" }}>leading</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: (bReturn as number) >= 0 ? "#4ade80" : "#f87171" }}>
                          {`${(bReturn as number) >= 0 ? "+" : ""}${(bReturn as number).toFixed(2)}%`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Tournament winner */}
      {rounds.every(r => r.status === "complete") && (() => {
        const finalRound = rounds[rounds.length - 1];
        const finalMatchup = matchups.find(m => m.round_id === finalRound.id);
        const winnerId = finalMatchup?.winner_id;
        const winnerName = participantName(winnerId ?? null);
        const iWon = isMe(winnerId ?? null);
        return (
          <div style={{ padding: "20px 14px", textAlign: "center", background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", marginBottom: 2 }}>
              {iWon ? "You won the tournament!" : `${winnerName} wins!`}
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.4)" }}>
              Tournament complete
            </div>
          </div>
        );
      })()}
    </div>
  );
}
