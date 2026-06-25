import { createClient } from "@supabase/supabase-js";
export { AI_LIMITS } from "./aiLimits";
export type { AIFeature } from "./aiLimits";
import type { AIFeature } from "./aiLimits";
import { AI_LIMITS } from "./aiLimits";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type RateLimitResult =
  | { allowed: true; userId: string; remaining: number }
  | { allowed: false; error: string; remaining: number };

export async function checkRateLimit(
  authHeader: string | null,
  feature: AIFeature
): Promise<RateLimitResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { allowed: false, error: "Not authenticated", remaining: 0 };
  }

  const token = authHeader.slice(7);
  const db = getAdminClient();

  // Verify the JWT and get the user
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    return { allowed: false, error: "Invalid or expired session", remaining: 0 };
  }

  const limit = AI_LIMITS[feature];

  // Count today's usage (UTC day boundary)
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", feature)
    .gte("created_at", startOfDay.toISOString());

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  if (used >= limit) {
    return {
      allowed: false,
      error: `You've used all ${limit} ${feature === "advisor" ? "AI Advisor" : "Stock Predict"} calls for today. Resets at midnight UTC.`,
      remaining: 0,
    };
  }

  // Record this call before proceeding
  await db.from("ai_usage").insert({ user_id: user.id, feature });

  return { allowed: true, userId: user.id, remaining: remaining - 1 };
}

// Lightweight read-only check — used by the frontend to show remaining count
export async function getRemainingCalls(
  authHeader: string | null,
  feature: AIFeature
): Promise<number> {
  if (!authHeader?.startsWith("Bearer ")) return 0;

  const token = authHeader.slice(7);
  const db = getAdminClient();

  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return 0;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature", feature)
    .gte("created_at", startOfDay.toISOString());

  return Math.max(0, AI_LIMITS[feature] - (count ?? 0));
}
