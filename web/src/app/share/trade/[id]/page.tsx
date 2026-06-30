import { createClient } from "@supabase/supabase-js";
import { Metadata } from "next";
import Link from "next/link";

interface TradeData {
  id:               string;
  symbol:           string;
  action:           "buy" | "sell";
  shares:           number;
  price:            number;
  total:            number;
  executed_at:      string;
  username:         string;
  competition_name: string;
}

async function getTradeData(id: string): Promise<TradeData | null> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: trade } = await db
    .from("trades")
    .select("id, symbol, action, shares, price, total, executed_at, participant_id")
    .eq("id", id)
    .single();

  if (!trade) return null;

  const { data: participant } = await db
    .from("competition_participants")
    .select("user_id, competition_id")
    .eq("id", trade.participant_id)
    .single();

  const [{ data: profile }, { data: competition }] = await Promise.all([
    participant
      ? db.from("profiles").select("username").eq("id", participant.user_id).single()
      : Promise.resolve({ data: null }),
    participant
      ? db.from("competitions").select("name").eq("id", participant.competition_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id:               trade.id,
    symbol:           trade.symbol,
    action:           trade.action as "buy" | "sell",
    shares:           trade.shares,
    price:            trade.price,
    total:            trade.total,
    executed_at:      trade.executed_at,
    username:         (profile as { username?: string } | null)?.username ?? "Trader",
    competition_name: (competition as { name?: string } | null)?.name ?? "Tradecraft",
  };
}

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const trade = await getTradeData(params.id);
  if (!trade) return { title: "Trade · Tradecraft" };

  const verb    = trade.action === "buy" ? "bought" : "sold";
  const action  = trade.action === "buy" ? "🟢 BUY" : "🔴 SELL";
  const total   = trade.total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const desc    = `${trade.username} ${verb} ${trade.shares} shares of ${trade.symbol} for ${total} in ${trade.competition_name}.`;

  return {
    title: `${action} ${trade.symbol} — ${trade.username} on Tradecraft`,
    description: desc,
    openGraph: {
      title: `${action} ${trade.symbol} · Tradecraft`,
      description: desc,
      siteName: "Tradecraft",
    },
    twitter: {
      card: "summary",
      title: `${action} ${trade.symbol} · Tradecraft`,
      description: desc,
    },
  };
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ShareTradePage({ params }: { params: { id: string } }) {
  const trade = await getTradeData(params.id);

  const base: React.CSSProperties = {
    minHeight:       "100vh",
    background:      "#060a14",
    color:           "#e8eaf0",
    display:         "flex",
    flexDirection:   "column",
    alignItems:      "center",
    justifyContent:  "center",
    padding:         "32px 16px",
    fontFamily:      "'Inter', system-ui, sans-serif",
  };

  if (!trade) {
    return (
      <div style={base}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🤷</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Trade not found</div>
        <Link href="/" style={{ color: "#7dd3b0", fontSize: 13, textDecoration: "none" }}>
          ← Back to Tradecraft
        </Link>
      </div>
    );
  }

  const isBuy     = trade.action === "buy";
  const accentColor = isBuy ? "#4ade80" : "#f87171";
  const dimAccent   = isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)";
  const borderAccent = isBuy ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)";

  return (
    <div style={base}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
        <span style={{ color: "#7dd3b0", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>TC</span>
        <span style={{ fontWeight: 600, fontSize: 14, color: "rgba(232,234,240,0.7)" }}>Tradecraft</span>
      </div>

      {/* Card */}
      <div style={{
        width:        "100%",
        maxWidth:     420,
        background:   "rgba(255,255,255,0.03)",
        border:       `1px solid ${borderAccent}`,
        borderRadius: 20,
        overflow:     "hidden",
        boxShadow:    `0 0 80px ${isBuy ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)"}`,
      }}>

        {/* Top bar */}
        <div style={{
          background: dimAccent,
          padding:    "12px 20px",
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${borderAccent}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
              color: accentColor, textTransform: "uppercase",
            }}>
              {isBuy ? "● BUY" : "● SELL"}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>
            {timeAgo(trade.executed_at)}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 24px 20px" }}>

          {/* Symbol */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em",
              color: "rgba(232,234,240,0.95)", lineHeight: 1, fontFamily: "monospace",
            }}>
              {trade.symbol}
            </div>
          </div>

          {/* Trade details */}
          <div style={{
            background:   "rgba(255,255,255,0.04)",
            borderRadius: 12,
            padding:      "14px 16px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "rgba(232,234,240,0.5)" }}>Shares</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{trade.shares}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "rgba(232,234,240,0.5)" }}>Price</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{formatMoney(trade.price)}</span>
            </div>
            <div style={{
              display:       "flex",
              justifyContent: "space-between",
              paddingTop:    8,
              borderTop:     "1px solid rgba(255,255,255,0.07)",
              marginTop:     4,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: accentColor }}>
                {formatMoney(trade.total)}
              </span>
            </div>
          </div>

          {/* Player + Competition */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "rgba(125,211,176,0.1)",
              border: "1px solid rgba(125,211,176,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#7dd3b0", flexShrink: 0,
            }}>
              {trade.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {trade.username}
              </div>
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {trade.competition_name}
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{
          borderTop:   "1px solid rgba(255,255,255,0.06)",
          padding:     "12px 24px",
          display:     "flex",
          alignItems:  "center",
          justifyContent: "space-between",
          background:  "rgba(255,255,255,0.01)",
        }}>
          <span style={{ fontSize: 10, color: "rgba(232,234,240,0.35)", letterSpacing: "0.04em" }}>
            tradecraft.voxlabs.dev
          </span>
          <Link
            href="https://tradecraft.voxlabs.dev"
            style={{
              fontSize:    11, fontWeight: 700, color: "#7dd3b0",
              background:  "rgba(125,211,176,0.08)",
              border:      "1px solid rgba(125,211,176,0.2)",
              borderRadius: 8, padding: "5px 12px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Play now →
          </Link>
        </div>
      </div>

      {/* Bottom label */}
      <p style={{ marginTop: 24, fontSize: 12, color: "rgba(232,234,240,0.3)", textAlign: "center" }}>
        This trade was made on Tradecraft — the stock market game.
      </p>
    </div>
  );
}
