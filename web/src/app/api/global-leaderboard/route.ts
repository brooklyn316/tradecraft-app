import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface GlobalEntry {
  user_id:          string;
  username:         string;
  avatar_url:       string | null;
  best_return_pct:  number;
  avg_return_pct:   number;
  total_comps:      number;
  wins:             number;
  total_pnl:        number;
  current_streak:   number;
  longest_streak:   number;
  badge_count:      number;
  rank:             number;
}

// ── GET /api/global-leaderboard ───────────────────────────────────────────
export async function GET() {
  const db = getAdminClient();

  // 1. All human participants with their competition data
  const { data: participants } = await db
    .from("competition_participants")
    .select(`
      id,
      user_id,
      cash_balance,
      competition_id,
      competitions!inner(id, starting_cash, status, name)
    `)
    .eq("is_bot", false)
    .not("user_id", "is", null);

  if (!participants?.length) return NextResponse.json({ entries: [] });

  // 2. Current stock prices (for live portfolio valuation of active comps)
  const { data: priceRows } = await db.from("stock_prices").select("symbol, price");
  const priceMap = Object.fromEntries((priceRows ?? []).map(p => [p.symbol, p.price as number]));

  // 3. Holdings for active competitions
  const activeParticipantIds = (participants as any[])
    .filter(p => (p.competitions as any)?.status === "active")
    .map(p => p.id);

  const holdingsByParticipant: Record<string, number> = {};
  if (activeParticipantIds.length > 0) {
    const { data: holdings } = await db
      .from("holdings")
      .select("participant_id, symbol, shares")
      .in("participant_id", activeParticipantIds);
    for (const h of (holdings ?? []) as { participant_id: string; symbol: string; shares: number }[]) {
      holdingsByParticipant[h.participant_id] =
        (holdingsByParticipant[h.participant_id] ?? 0) + h.shares * (priceMap[h.symbol] ?? 0);
    }
  }

  // 4. Per-competition win detection: find rank-1 participant per competition
  const compIds = [...new Set((participants as any[]).map(p => p.competition_id))];
  const winnerByComp: Record<string, string> = {};
  for (const compId of compIds) {
    const compParticipants = (participants as any[]).filter(p => p.competition_id === compId);
    let best = -Infinity;
    let winnerId = "";
    for (const p of compParticipants) {
      const holdVal = holdingsByParticipant[p.id] ?? 0;
      const total   = p.cash_balance + holdVal;
      if (total > best) { best = total; winnerId = p.user_id; }
    }
    if (winnerId) winnerByComp[compId] = winnerId;
  }

  // 5. Aggregate per user
  const userMap: Record<string, {
    total_comps: number;
    returns: number[];
    pnl: number;
    wins: number;
  }> = {};

  for (const p of participants as any[]) {
    const comp        = p.competitions as any;
    const startCash   = comp.starting_cash as number;
    const holdVal     = holdingsByParticipant[p.id] ?? 0;
    const totalValue  = p.cash_balance + holdVal;
    const returnPct   = ((totalValue - startCash) / startCash) * 100;
    const pnl         = totalValue - startCash;
    const isWinner    = winnerByComp[p.competition_id] === p.user_id;

    if (!userMap[p.user_id]) {
      userMap[p.user_id] = { total_comps: 0, returns: [], pnl: 0, wins: 0 };
    }
    userMap[p.user_id].total_comps++;
    userMap[p.user_id].returns.push(returnPct);
    userMap[p.user_id].pnl += pnl;
    if (isWinner) userMap[p.user_id].wins++;
  }

  const userIds = Object.keys(userMap);

  // 6. Fetch profiles, streaks, badge counts in parallel
  const [{ data: profiles }, { data: streaks }, { data: badgeCounts }] = await Promise.all([
    db.from("profiles").select("id, username, avatar_url").in("id", userIds),
    db.from("user_streaks").select("user_id, current_streak, longest_streak").in("user_id", userIds),
    db.from("user_badges").select("user_id").in("user_id", userIds),
  ]);

  const profileMap  = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
  const streakMap   = Object.fromEntries((streaks ?? []).map((s: any) => [s.user_id, s]));
  const badgeCountMap: Record<string, number> = {};
  for (const b of (badgeCounts ?? []) as { user_id: string }[]) {
    badgeCountMap[b.user_id] = (badgeCountMap[b.user_id] ?? 0) + 1;
  }

  // 7. Build entries
  const entries: GlobalEntry[] = userIds.map(uid => {
    const agg      = userMap[uid];
    const profile  = profileMap[uid] ?? {};
    const streak   = streakMap[uid]  ?? { current_streak: 0, longest_streak: 0 };
    const returns  = agg.returns;
    const bestRet  = Math.max(...returns);
    const avgRet   = returns.reduce((s, r) => s + r, 0) / returns.length;

    return {
      user_id:         uid,
      username:        profile.username ?? "Player",
      avatar_url:      profile.avatar_url ?? null,
      best_return_pct: Math.round(bestRet * 100) / 100,
      avg_return_pct:  Math.round(avgRet  * 100) / 100,
      total_comps:     agg.total_comps,
      wins:            agg.wins,
      total_pnl:       Math.round(agg.pnl * 100) / 100,
      current_streak:  streak.current_streak,
      longest_streak:  streak.longest_streak,
      badge_count:     badgeCountMap[uid] ?? 0,
      rank:            0,
    };
  });

  // 8. Sort by best return, assign ranks
  entries.sort((a, b) => b.best_return_pct - a.best_return_pct);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return NextResponse.json({ entries: entries.slice(0, 100) });
}
