import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DURATION_MINUTES: Record<string, number> = {
  "15min": 15,
  "1h":    60,
  "4h":    240,
  "1d":    1440,
};

function roundName(roundNumber: number, totalRounds: number): string {
  const remaining = totalRounds - roundNumber + 1;
  if (remaining === 1) return "Final";
  if (remaining === 2) return "Semifinal";
  if (remaining === 3) return "Quarterfinal";
  return `Round ${roundNumber}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resetParticipants(competitionId: string, startingCash: number, participantIds: string[]) {
  // Reset cash and clear all holdings for each participant in the round
  for (const pid of participantIds) {
    await supabase.from("competition_participants")
      .update({ cash_balance: startingCash })
      .eq("id", pid);
    await supabase.from("holdings")
      .delete()
      .eq("participant_id", pid);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, competitionId, roundDuration = "1h" } = body;

    if (action === "start") {
      // Fetch competition
      const { data: comp } = await supabase
        .from("competitions")
        .select("id, starting_cash, style")
        .eq("id", competitionId)
        .single();
      if (!comp) return NextResponse.json({ error: "Competition not found" }, { status: 404 });
      if (comp.style !== "bracket") return NextResponse.json({ error: "Not a bracket competition" }, { status: 400 });

      // Check no existing rounds
      const { data: existing } = await supabase
        .from("bracket_rounds")
        .select("id")
        .eq("competition_id", competitionId)
        .limit(1);
      if (existing?.length) return NextResponse.json({ error: "Bracket already started" }, { status: 400 });

      // Fetch participants
      const { data: participants } = await supabase
        .from("competition_participants")
        .select("id, is_bot, bot_strategy")
        .eq("competition_id", competitionId);
      if (!participants?.length) return NextResponse.json({ error: "No participants" }, { status: 400 });

      const seeded = shuffle(participants);
      const totalRounds = Math.ceil(Math.log2(seeded.length));

      // Create Round 1
      const startAt = new Date();
      const endAt   = new Date(startAt.getTime() + DURATION_MINUTES[roundDuration] * 60 * 1000);

      const { data: round } = await supabase
        .from("bracket_rounds")
        .insert({
          competition_id: competitionId,
          round_number:   1,
          round_name:     roundName(1, totalRounds),
          round_duration: roundDuration,
          start_at:       startAt.toISOString(),
          end_at:         endAt.toISOString(),
          status:         "active",
        })
        .select()
        .single();
      if (!round) return NextResponse.json({ error: "Failed to create round" }, { status: 500 });

      // Create matchups (pairs)
      const matchups = [];
      for (let i = 0; i < seeded.length; i += 2) {
        const a = seeded[i];
        const b = seeded[i + 1] ?? null;
        matchups.push({
          round_id:       round.id,
          competition_id: competitionId,
          slot:           Math.floor(i / 2),
          participant_a:  a.id,
          participant_b:  b?.id ?? null,
          is_bye:         !b,
          winner_id:      !b ? a.id : null, // bye → auto-advance
        });
      }
      await supabase.from("bracket_matchups").insert(matchups);

      // Reset all participants' cash + holdings for a clean start
      await resetParticipants(competitionId, comp.starting_cash, seeded.map(p => p.id));

      return NextResponse.json({ success: true, round, matchups });
    }

    if (action === "advance") {
      // Resolve the current active round and create the next one
      const { roundId } = body;
      const { data: round } = await supabase
        .from("bracket_rounds")
        .select("*, competition:competitions(starting_cash)")
        .eq("id", roundId)
        .single();
      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

      // Fetch matchups
      const { data: matchups } = await supabase
        .from("bracket_matchups")
        .select("*")
        .eq("round_id", roundId);

      // Fetch all participant states + holdings to compute returns
      const participantIds = [
        ...matchups!.flatMap(m => [m.participant_a, m.participant_b].filter(Boolean)),
      ];

      const { data: participants } = await supabase
        .from("competition_participants")
        .select("id, cash_balance")
        .in("id", participantIds);

      const { data: allHoldings } = await supabase
        .from("holdings")
        .select("participant_id, symbol, shares, avg_cost")
        .in("participant_id", participantIds);

      const { data: prices } = await supabase
        .from("stock_prices")
        .select("symbol, price");

      const priceMap = Object.fromEntries((prices ?? []).map(p => [p.symbol, p.price]));
      const startingCash = (round.competition as any)?.starting_cash ?? 10000;

      function portfolioValue(pid: string): number {
        const p = participants?.find(x => x.id === pid);
        if (!p) return startingCash;
        const holdingsVal = (allHoldings ?? [])
          .filter(h => h.participant_id === pid)
          .reduce((s, h) => s + h.shares * (priceMap[h.symbol] ?? h.avg_cost), 0);
        return p.cash_balance + holdingsVal;
      }

      // Determine winners and update matchups
      const winners: string[] = [];
      for (const m of (matchups ?? [])) {
        if (m.is_bye || !m.participant_b) {
          winners.push(m.winner_id ?? m.participant_a);
          continue;
        }
        const returnA = ((portfolioValue(m.participant_a) - startingCash) / startingCash) * 100;
        const returnB = ((portfolioValue(m.participant_b) - startingCash) / startingCash) * 100;
        const winnerId = returnA >= returnB ? m.participant_a : m.participant_b;
        winners.push(winnerId);
        await supabase.from("bracket_matchups").update({
          return_a: returnA, return_b: returnB, winner_id: winnerId,
        }).eq("id", m.id);
      }

      // Mark round complete
      await supabase.from("bracket_rounds").update({ status: "complete" }).eq("id", roundId);

      if (winners.length <= 1) {
        // Tournament over — mark competition ended
        await supabase.from("competitions").update({ status: "ended" }).eq("id", round.competition_id);
        return NextResponse.json({ success: true, tournamentOver: true, winnerId: winners[0] });
      }

      // Create next round
      const nextRoundNumber = round.round_number + 1;
      const { data: existingRounds } = await supabase
        .from("bracket_rounds").select("id").eq("competition_id", round.competition_id);
      const totalRounds = Math.max(nextRoundNumber, (existingRounds?.length ?? 0) + 1);

      const startAt = new Date();
      const endAt   = new Date(startAt.getTime() + DURATION_MINUTES[round.round_duration] * 60 * 1000);

      const { data: nextRound } = await supabase
        .from("bracket_rounds")
        .insert({
          competition_id: round.competition_id,
          round_number:   nextRoundNumber,
          round_name:     roundName(nextRoundNumber, totalRounds),
          round_duration: round.round_duration,
          start_at:       startAt.toISOString(),
          end_at:         endAt.toISOString(),
          status:         "active",
        })
        .select()
        .single();

      // Create next-round matchups from winners
      const nextMatchups = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextMatchups.push({
          round_id:       nextRound!.id,
          competition_id: round.competition_id,
          slot:           Math.floor(i / 2),
          participant_a:  winners[i],
          participant_b:  winners[i + 1] ?? null,
          is_bye:         !winners[i + 1],
          winner_id:      !winners[i + 1] ? winners[i] : null,
        });
      }
      await supabase.from("bracket_matchups").insert(nextMatchups);

      // Reset cash for next round
      await resetParticipants(round.competition_id, startingCash, winners);

      return NextResponse.json({ success: true, nextRound, nextMatchups });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
