import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET — look up a competition by invite code (public, no auth needed)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const db = getAdminClient();
  const { data: competition, error } = await db
    .from("competitions")
    .select("id, name, mode, starting_cash, start_date, end_date, status, invite_code")
    .eq("invite_code", code.toUpperCase())
    .single();

  if (error || !competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  // Get participant count (excluding bots)
  const { count } = await db
    .from("competition_participants")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competition.id)
    .eq("is_bot", false);

  return NextResponse.json({ competition: { ...competition, participant_count: count ?? 0 } });
}

// POST — join a competition by invite code
export async function POST(req: NextRequest) {
  try {
    const { code, userId } = await req.json();
    if (!code || !userId) return NextResponse.json({ error: "Missing code or userId" }, { status: 400 });

    const db = getAdminClient();

    // Find the competition
    const { data: competition, error: compErr } = await db
      .from("competitions")
      .select("id, status, starting_cash, end_date")
      .eq("invite_code", code.toUpperCase())
      .single();

    if (compErr || !competition) return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    if (competition.status !== "active") return NextResponse.json({ error: "This competition has ended" }, { status: 400 });
    if (new Date(competition.end_date) < new Date()) return NextResponse.json({ error: "This competition has already ended" }, { status: 400 });

    // Check if already a participant
    const { data: existing } = await db
      .from("competition_participants")
      .select("id")
      .eq("competition_id", competition.id)
      .eq("user_id", userId)
      .single();

    if (existing) return NextResponse.json({ alreadyJoined: true, competitionId: competition.id });

    // Add participant
    const { data: participant, error: partErr } = await db
      .from("competition_participants")
      .insert({
        competition_id: competition.id,
        user_id: userId,
        cash_balance: competition.starting_cash,
        is_bot: false,
      })
      .select()
      .single();

    if (partErr) throw partErr;

    return NextResponse.json({ success: true, participant, competitionId: competition.id });
  } catch (err) {
    console.error("Join error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
