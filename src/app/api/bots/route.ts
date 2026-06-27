import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const BOT_NAMES: Record<string, string> = {
  index:    "Index Bot",
  momentum: "Momentum Bot",
  random:   "Chaos Bot",
};

// POST — add bots to a competition
export async function POST(req: NextRequest) {
  try {
    const { competitionId, startingCash } = await req.json();
    if (!competitionId || !startingCash) {
      return NextResponse.json({ error: "Missing competitionId or startingCash" }, { status: 400 });
    }

    const db = getAdminClient();

    // Check if bots already exist
    const { data: existing } = await db
      .from("competition_participants")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("is_bot", true);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Bots already in this competition" }, { status: 409 });
    }

    const bots = [
      { competition_id: competitionId, is_bot: true, bot_strategy: "index",    cash_balance: startingCash, user_id: null },
      { competition_id: competitionId, is_bot: true, bot_strategy: "momentum", cash_balance: startingCash, user_id: null },
      { competition_id: competitionId, is_bot: true, bot_strategy: "random",   cash_balance: startingCash, user_id: null },
    ];

    const { error } = await db.from("competition_participants").insert(bots);
    if (error) throw error;

    return NextResponse.json({ success: true, botsAdded: bots.length, names: Object.values(BOT_NAMES) });
  } catch (err) {
    console.error("Add bots error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE — remove all bots from a competition
export async function DELETE(req: NextRequest) {
  try {
    const { competitionId } = await req.json();
    if (!competitionId) {
      return NextResponse.json({ error: "Missing competitionId" }, { status: 400 });
    }

    const db = getAdminClient();

    // Remove bot holdings first
    const { data: botParticipants } = await db
      .from("competition_participants")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("is_bot", true);

    if (botParticipants && botParticipants.length > 0) {
      const botIds = botParticipants.map(b => b.id);
      await db.from("holdings").delete().in("participant_id", botIds);
      await db.from("trades").delete().in("participant_id", botIds);
    }

    const { error } = await db
      .from("competition_participants")
      .delete()
      .eq("competition_id", competitionId)
      .eq("is_bot", true);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove bots error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
