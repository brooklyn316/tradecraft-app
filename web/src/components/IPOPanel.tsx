"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";

interface IPOEvent {
  id: string;
  competition_id: string;
  symbol: string;
  company_name: string;
  ipo_price: number;
  list_at: string;
  listed: boolean;
  hype_level: "low" | "medium" | "high";
  description: string | null;
}

interface IPOPanelProps {
  competitionId: string;
  onSelectSymbol: (symbol: string) => void;
}

const HYPE_COLOR: Record<string, string> = {
  low:    "#60a5fa",
  medium: "#fbbf24",
  high:   "#f87171",
};
const HYPE_LABEL: Record<string, string> = {
  low:    "Low Hype",
  medium: "Hot",
  high:   "🔥 Frenzy",
};

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [targetIso]);

  const totalSecs = Math.floor(remaining / 1000);
  const hrs  = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2,"0")}s`;
  return `${secs}s`;
}

function CountdownBadge({ listAt }: { listAt: string }) {
  const label = useCountdown(listAt);
  const imminent = new Date(listAt).getTime() - Date.now() < 60_000;
  return (
    <span style={{
      fontSize: 11, fontFamily: "monospace", fontWeight: 700,
      color: imminent ? "#f87171" : "rgba(232,234,240,0.6)",
      animation: imminent ? "pulse 1s ease-in-out infinite" : "none",
    }}>
      {label}
    </span>
  );
}

export default function IPOPanel({ competitionId, onSelectSymbol }: IPOPanelProps) {
  const supabase = getSupabaseClient();
  const [ipos, setIpos] = useState<IPOEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("ipo_events")
      .select("*")
      .eq("competition_id", competitionId)
      .order("list_at", { ascending: true });
    setIpos((data ?? []) as IPOEvent[]);
    setLoading(false);
  }, [competitionId, supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const upcoming = ipos.filter(i => !i.listed);
  const live     = ipos.filter(i => i.listed);

  if (loading) {
    return (
      <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(232,234,240,0.4)", fontSize: 12 }}>
        Loading IPOs…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } @keyframes ipoGlow { 0%{box-shadow:0 0 0 0 rgba(248,113,113,0.4)} 70%{box-shadow:0 0 0 8px rgba(248,113,113,0)} 100%{box-shadow:0 0 0 0 rgba(248,113,113,0)} }`}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 2 }}>🚀 IPO Events</div>
        <div style={{ fontSize: 11, color: "rgba(232,234,240,0.45)" }}>
          New stocks listing during this competition
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <>
            <div style={{ padding: "10px 16px 4px", fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Upcoming
            </div>
            {upcoming.map(ipo => (
              <div key={ipo.id} style={{
                margin: "6px 12px",
                padding: "12px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{ipo.symbol}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: `${HYPE_COLOR[ipo.hype_level]}18`,
                        color: HYPE_COLOR[ipo.hype_level] }}>
                        {HYPE_LABEL[ipo.hype_level]}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(232,234,240,0.55)" }}>{ipo.company_name}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "white" }}>
                      ${Number(ipo.ipo_price).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(232,234,240,0.45)", marginTop: 1 }}>IPO price</div>
                  </div>
                </div>

                {ipo.description && (
                  <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", lineHeight: 1.5, marginBottom: 8 }}>
                    {ipo.description}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>Lists in</span>
                    <CountdownBadge listAt={ipo.list_at} />
                  </div>
                  <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(232,234,240,0.3)" }}>
                    {new Date(ipo.list_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Live / Traded */}
        {live.length > 0 && (
          <>
            <div style={{ padding: "10px 16px 4px", fontSize: 9, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Now Trading
            </div>
            {live.map(ipo => (
              <button key={ipo.id}
                onClick={() => onSelectSymbol(ipo.symbol)}
                style={{
                  width: "calc(100% - 24px)", margin: "6px 12px",
                  padding: "12px 14px",
                  background: "rgba(74,222,128,0.04)",
                  border: "1px solid rgba(74,222,128,0.2)",
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "block",
                  animation: "ipoGlow 2s ease-out 1",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{ipo.symbol}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>LIVE</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)" }}>{ipo.company_name}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(232,234,240,0.45)" }}>
                      IPO @ ${Number(ipo.ipo_price).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600, marginTop: 2 }}>Trade →</div>
                  </div>
                </div>
              </button>
            ))}
          </>
        )}

        {ipos.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🚀</div>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.45)" }}>No IPOs scheduled</div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.3)", marginTop: 4 }}>New listings will appear here</div>
          </div>
        )}

      </div>
    </div>
  );
}
