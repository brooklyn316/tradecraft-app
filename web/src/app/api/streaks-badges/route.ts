import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── GET /api/streaks-badges?userId=<uuid>&participantId=<uuid> ────────────
export async function GET(req: NextRequest) {
  const userId        = req.nextUrl.searchParams.get("userId");
  const participantId = req.nextUrl.searchParams.get("participantId");

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const db = getAdminClient();

  const [{ data: streak }, { data: badges }, completionCount] = await Promise.all([
    db.from("user_streaks").select("*").eq("user_id", userId).single(),
    db.from("user_badges").select("badge_type, earned_at, metadata").eq("user_id", userId).order("earned_at"),
    participantId
      ? db.from("daily_challenge_completions")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", participantId)
          .then(r => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return NextResponse.json({
    streak:           streak ?? { current_streak: 0, longest_streak: 0, last_challenge_date: null },
    badges:           badges ?? [],
    challengeCount:   completionCount,
  });
}
