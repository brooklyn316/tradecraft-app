import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let botQuery: { data: unknown; error: unknown } = { data: null, error: null };
  try {
    if (url && key) {
      const sb = createClient(url, key);
      const result = await sb.from("bots").select("code, name").limit(3);
      botQuery = { data: result.data, error: result.error };
    }
  } catch (e) {
    botQuery = { data: null, error: String(e) };
  }

  return NextResponse.json({
    supabaseUrl: url ?? "NOT SET",
    hasServiceKey: !!key,
    serviceKeyPrefix: key ? key.substring(0, 12) + "..." : "NOT SET",
    cronSecret: process.env.CRON_SECRET ? "SET" : "NOT SET",
    botQuery,
  });
}
