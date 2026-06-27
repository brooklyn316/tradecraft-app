"use client";

import { useState } from "react";
import type { Holding, StockPrice, Trade, CompetitionParticipant } from "@/types";
import { formatCurrency } from "@/lib/stockApi";
import { getSupabaseClient } from "@/lib/supabase";
import { AI_LIMITS } from "@/lib/aiLimits";

// ── Rough sector map for common tickers ────────────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  AAPL:"Tech", MSFT:"Tech", GOOGL:"Tech", META:"Tech", NVDA:"Tech", AMD:"Tech",
  AMZN:"E-Commerce", TSLA:"EV/Auto", NFLX:"Media", DIS:"Media",
  JPM:"Finance", BAC:"Finance", GS:"Finance", V:"Finance", MA:"Finance",
  JNJ:"Healthcare", PFE:"Healthcare", UNH:"Healthcare", ABBV:"Healthcare", MRK:"Healthcare",
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy",
  WMT:"Retail", TGT:"Retail", COST:"Retail", HD:"Home",
  KO:"Consumer", PEP:"Consumer", MCD:"Consumer", SBUX:"Consumer",
  BA:"Aerospace", LMT:"Aerospace", RTX:"Aerospace",
  BRK_B:"Conglomerate",
  SPY:"ETF", QQQ:"ETF", IWM:"ETF",
};

function getSector(symbol: string) {
  return SECTOR_MAP[symbol] ?? "Other";
}

// ── Inline diversification picker shown under DIVERSIFY cards ───────────────
function DiversifyPicker({ stocks, holdings, onSelectSymbol }: {
  stocks: StockPrice[];
  holdings: Holding[];
  onSelectSymbol: (sym: string) => void;
}) {
  const heldSymbols = new Set(holdings.map(h => h.symbol));

  // Group unheld stocks by sector, pick best performer per sector
  const bySector: Record<string, StockPrice[]> = {};
  for (const s of stocks) {
    if (heldSymbols.has(s.symbol) || s.price <= 0) continue;
    const sector = getSector(s.symbol);
    if (!bySector[sector]) bySector[sector] = [];
    bySector[sector].push(s);
  }

  // Held sectors — we want to suggest sectors the user lacks
  const heldSectors = new Set(holdings.map(h => getSector(h.symbol)));

  // Sort sectors: unheld first, then held sectors, then "Other"
  const sectors = Object.keys(bySector).sort((a, b) => {
    const aHeld = heldSectors.has(a) ? 1 : 0;
    const bHeld = heldSectors.has(b) ? 1 : 0;
    if (aHeld !== bHeld) return aHeld - bHeld;
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  // One pick per sector, up to 6 total
  const picks: (StockPrice & { sector: string; isNewSector: boolean })[] = [];
  for (const sector of sectors) {
    if (picks.length >= 6) break;
    const candidates = bySector[sector].sort((a, b) =>
      Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0)
    );
    const pick = candidates[0];
    picks.push({ ...pick, sector, isNewSector: !heldSectors.has(sector) });
  }

  if (picks.length === 0) {
    return (
      <div style={{ padding: "10px 0 2px", fontSize: 11, color: "rgba(232,234,240,0.52)" }}>
        No new sectors available — you hold everything!
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Diversification ideas
      </div>
      {picks.map(p => {
        const chg = p.change_percent ?? 0;
        const isUp = chg >= 0;
        return (
          <div key={p.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* New sector badge */}
            <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: p.isNewSector ? "#7dd3b0" : "rgba(255,255,255,0.15)" }} title={p.isNewSector ? "New sector for you" : "Sector you already hold"} />
            {/* Symbol + sector */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(232,234,240,0.85)" }}>{p.symbol}</span>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: p.isNewSector ? "rgba(125,211,176,0.1)" : "rgba(255,255,255,0.05)", color: p.isNewSector ? "#7dd3b0" : "rgba(232,234,240,0.5)", fontWeight: 600 }}>
                  {p.sector}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.company_name ?? p.symbol}
              </div>
            </div>
            {/* Price + change */}
            <div style={{ textAlign: "right", flexShrink: 0, marginRight: 4 }}>
              <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "rgba(232,234,240,0.7)" }}>${p.price.toFixed(2)}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: isUp ? "#4ade80" : "#f87171" }}>
                {isUp ? "+" : ""}{chg.toFixed(2)}%
              </div>
            </div>
            {/* View button */}
            <button onClick={() => onSelectSymbol(p.symbol)}
              style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer", background: "rgba(125,211,176,0.08)", border: "1px solid rgba(125,211,176,0.2)", color: "#7dd3b0" }}>
              View →
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: "rgba(232,234,240,0.4)", paddingTop: 2 }}>
        Green dot = sector you don&apos;t currently hold · sorted by diversification potential
      </div>
    </div>
  );
}

interface Suggestion {
  action: "BUY" | "SELL" | "HOLD" | "DIVERSIFY";
  symbol: string | null;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

interface AdvisorResponse {
  summary: string;
  suggestions: Suggestion[];
}

interface AIAdvisorProps {
  participant: CompetitionParticipant;
  holdings: Holding[];
  stocks: StockPrice[];
  recentTrades: Trade[];
  startingCash: number;
  onSelectSymbol: (symbol: string) => void;
}

const ACTION_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  BUY:       { bg: "rgba(74,222,128,0.1)",  color: "#4ade80", border: "rgba(74,222,128,0.25)" },
  SELL:      { bg: "rgba(248,113,113,0.1)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
  HOLD:      { bg: "rgba(96,165,250,0.1)",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  DIVERSIFY: { bg: "rgba(125,211,176,0.1)", color: "#7dd3b0", border: "rgba(125,211,176,0.25)" },
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   "#f87171",
  medium: "#fbbf24",
  low:    "#4ade80",
};

export default function AIAdvisor({ participant, holdings, stocks, recentTrades, startingCash, onSelectSymbol }: AIAdvisorProps) {
  const [advice, setAdvice] = useState<AdvisorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dotCount, setDotCount] = useState(1);
  const [expandedDiversify, setExpandedDiversify] = useState<Set<number>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(null);

  // Compute portfolio stats for the "will analyse" preview
  const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.price]));
  const holdingsValue = holdings.reduce((sum, h) => sum + h.shares * (priceMap[h.symbol] ?? h.avg_cost), 0);
  const totalValue = participant.cash_balance + holdingsValue;
  const returnPct = ((totalValue - startingCash) / startingCash) * 100;

  async function getAdvice() {
    setLoading(true);
    setError(null);
    setAdvice(null);

    let d = 1;
    const interval = setInterval(() => { setDotCount((d++ % 3) + 1); }, 450);

    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          holdings,
          cashBalance: participant.cash_balance,
          stocks,
          recentTrades,
          startingCash,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");
      if (data.remaining !== undefined) setRemaining(data.remaining);
      setAdvice(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,rgba(125,211,176,0.25),rgba(74,222,128,0.15))", border: "1px solid rgba(125,211,176,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
            ✦
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,234,240,0.9)" }}>AI Advisor</div>
            <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)" }}>Powered by Claude</div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "rgba(232,234,240,0.32)", lineHeight: 1.55, margin: 0 }}>
          Analyses your positions, cash, market conditions, and recent trades — then tells you what to do next.
        </p>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Idle state */}
        {!advice && !loading && !error && (
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Portfolio snapshot */}
            <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>What Claude will analyse</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  ["Total portfolio",   `$${totalValue.toFixed(2)} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%)`],
                  ["Cash available",    formatCurrency(participant.cash_balance)],
                  ["Open positions",    `${holdings.length}`],
                  ["Trade history",     `${recentTrades.length} recent trade${recentTrades.length !== 1 ? "s" : ""}`],
                  ["Stocks tracked",    `${stocks.length}`],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "rgba(232,234,240,0.5)" }}>{label}</span>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(232,234,240,0.6)", fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={getAdvice} disabled={remaining === 0}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12,
                background: remaining === 0 ? "rgba(255,255,255,0.03)" : "linear-gradient(135deg,rgba(125,211,176,0.15),rgba(74,222,128,0.08))",
                border: `1px solid ${remaining === 0 ? "rgba(255,255,255,0.08)" : "rgba(125,211,176,0.28)"}`,
                color: remaining === 0 ? "rgba(232,234,240,0.3)" : "#7dd3b0",
                fontSize: 14, fontWeight: 700, cursor: remaining === 0 ? "not-allowed" : "pointer", letterSpacing: "-0.01em", transition: "all 0.2s" }}>
              ✦ Analyse My Portfolio
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontSize: 10, color: "rgba(232,234,240,0.4)", lineHeight: 1.5 }}>
                For entertainment only · Not financial advice
              </p>
              <span style={{ fontSize: 10, color: remaining === 0 ? "#f87171" : "rgba(232,234,240,0.4)", fontFamily: "monospace", flexShrink: 0 }}>
                {remaining !== null ? `${remaining}/${AI_LIMITS.advisor} left today` : `${AI_LIMITS.advisor}/day`}
              </span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg,rgba(125,211,176,0.2),rgba(74,222,128,0.1))", border: "1px solid rgba(125,211,176,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
              ✦
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(232,234,240,0.7)" }}>
                Analysing your portfolio{"...".slice(0, dotCount)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)", marginTop: 6, lineHeight: 1.5 }}>
                Reading positions, market conditions,<br />and your trade history
              </div>
            </div>
            <div style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, height: "100%", background: "linear-gradient(90deg,transparent,#7dd3b0,transparent)", borderRadius: 1, animation: "scan 1.6s ease-in-out infinite", width: "40%" }} />
            </div>
            <style>{`@keyframes scan { 0%{left:-40%} 100%{left:140%} }`}</style>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 5 }}>Analysis failed</div>
              <div style={{ fontSize: 11, color: "rgba(232,234,240,0.4)", lineHeight: 1.5 }}>{error}</div>
              {error.includes("ANTHROPIC_API_KEY") && (
                <div style={{ marginTop: 10, fontSize: 11, color: "rgba(232,234,240,0.58)", lineHeight: 1.6, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                  Add <code style={{ color: "#7dd3b0", fontSize: 10 }}>ANTHROPIC_API_KEY=your_key</code> to your <code style={{ color: "#7dd3b0", fontSize: 10 }}>.env.local</code> and Vercel environment variables, then redeploy.
                </div>
              )}
            </div>
            <button onClick={getAdvice}
              style={{ width: "100%", padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,234,240,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ↻ Try again
            </button>
          </div>
        )}

        {/* Results */}
        {advice && (
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Summary card */}
            <div style={{ background: "rgba(125,211,176,0.05)", border: "1px solid rgba(125,211,176,0.15)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#7dd3b0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                ✦ Portfolio Overview
              </div>
              <p style={{ fontSize: 12, color: "rgba(232,234,240,0.6)", lineHeight: 1.6, margin: 0 }}>{advice.summary}</p>
            </div>

            {/* Section header */}
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 4 }}>
              Recommendations
            </div>

            {/* Suggestion cards */}
            {advice.suggestions.map((s, i) => {
              const style = ACTION_STYLE[s.action] ?? ACTION_STYLE.HOLD;
              return (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Top row: action badge + symbol + priority */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 7px", borderRadius: 6, letterSpacing: "0.05em", background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                        {s.action}
                      </span>
                      {s.symbol && (
                        <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(232,234,240,0.85)", letterSpacing: "-0.01em" }}>
                          {s.symbol}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLOR[s.priority] ?? "#fbbf24" }} />
                      <span style={{ fontSize: 9, color: "rgba(232,234,240,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.priority}</span>
                    </div>
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,234,240,0.75)", lineHeight: 1.35 }}>{s.title}</div>

                  {/* Reason */}
                  <p style={{ fontSize: 11, color: "rgba(232,234,240,0.38)", lineHeight: 1.6, margin: 0 }}>{s.reason}</p>

                  {/* CTA — BUY: jump to stock */}
                  {s.symbol && s.action === "BUY" && (
                    <button
                      onClick={() => { onSelectSymbol(s.symbol!); }}
                      style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 8, background: style.bg, border: `1px solid ${style.border}`, color: style.color, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em" }}>
                      View {s.symbol} →
                    </button>
                  )}

                  {/* CTA — DIVERSIFY: toggle ideas picker */}
                  {s.action === "DIVERSIFY" && (
                    <div>
                      <button
                        onClick={() => setExpandedDiversify(prev => {
                          const next = new Set(prev);
                          next.has(i) ? next.delete(i) : next.add(i);
                          return next;
                        })}
                        style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 8, background: style.bg, border: `1px solid ${style.border}`, color: style.color, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em" }}>
                        {expandedDiversify.has(i) ? "Hide ideas ↑" : "Explore ideas ↓"}
                      </button>
                      {expandedDiversify.has(i) && (
                        <DiversifyPicker stocks={stocks} holdings={holdings} onSelectSymbol={onSelectSymbol} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Re-analyse */}
            <button onClick={getAdvice} disabled={remaining === 0}
              style={{ width: "100%", padding: "11px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                color: remaining === 0 ? "rgba(232,234,240,0.2)" : "rgba(232,234,240,0.58)",
                fontSize: 12, fontWeight: 600, cursor: remaining === 0 ? "not-allowed" : "pointer", marginTop: 4 }}>
              ↻ Re-analyse
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontSize: 10, color: "rgba(232,234,240,0.4)" }}>
                For entertainment only · Not financial advice
              </p>
              <span style={{ fontSize: 10, color: remaining === 0 ? "#f87171" : "rgba(232,234,240,0.4)", fontFamily: "monospace" }}>
                {remaining !== null ? `${remaining}/${AI_LIMITS.advisor} left today` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
