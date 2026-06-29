"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/stockApi";
import type { StockPrice } from "@/types";

type ConditionType =
  | "price_below" | "price_above"
  | "day_change_pct_below" | "day_change_pct_above"
  | "portfolio_value_below" | "portfolio_value_above";

type ActionType = "buy_shares" | "sell_shares" | "sell_all";
type RuleStatus = "active" | "triggered" | "paused" | "cancelled";

interface PlayerRule {
  id: string;
  participant_id: string;
  competition_id: string;
  condition_type: ConditionType;
  symbol: string | null;
  condition_value: number;
  action: ActionType;
  action_symbol: string | null;
  shares: number | null;
  repeat: boolean;
  status: RuleStatus;
  triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

interface AutomationRulesProps {
  participantId: string;
  competitionId: string;
  stocks: StockPrice[];
  cashBalance: number;
  refreshKey?: number;
}

const CONDITION_LABELS: Record<ConditionType, string> = {
  price_below:            "Price drops below",
  price_above:            "Price rises above",
  day_change_pct_below:   "Day change % drops below",
  day_change_pct_above:   "Day change % rises above",
  portfolio_value_below:  "Portfolio value drops below",
  portfolio_value_above:  "Portfolio value rises above",
};

const ACTION_LABELS: Record<ActionType, string> = {
  buy_shares:  "Buy shares",
  sell_shares: "Sell shares",
  sell_all:    "Sell all holdings",
};

const needsSymbol = (c: ConditionType) =>
  c === "price_below" || c === "price_above" ||
  c === "day_change_pct_below" || c === "day_change_pct_above";

const isPct = (c: ConditionType) =>
  c === "day_change_pct_below" || c === "day_change_pct_above";

function formatAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ruleDescription(rule: PlayerRule): string {
  const cond = CONDITION_LABELS[rule.condition_type];
  const sym  = rule.symbol ? ` ${rule.symbol}` : "";
  const val  = isPct(rule.condition_type)
    ? `${rule.condition_value > 0 ? "+" : ""}${rule.condition_value}%`
    : formatCurrency(rule.condition_value);

  const act = rule.action === "sell_all"
    ? `sell all ${rule.action_symbol ?? ""}`
    : `${ACTION_LABELS[rule.action].toLowerCase()} ${rule.shares} ${rule.action_symbol ?? ""}`;

  return `If${sym} ${cond.toLowerCase()} ${val} → ${act}`;
}

export default function AutomationRules({
  participantId, competitionId, stocks, cashBalance, refreshKey,
}: AutomationRulesProps) {
  const supabase = getSupabaseClient();

  const [rules,   setRules]   = useState<PlayerRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [filter,   setFilter]  = useState<"active" | "triggered" | "all">("active");

  // Form state
  const [condType,     setCondType]     = useState<ConditionType>("price_below");
  const [condSymbol,   setCondSymbol]   = useState("");
  const [condValue,    setCondValue]    = useState("");
  const [action,       setAction]       = useState<ActionType>("buy_shares");
  const [actionSymbol, setActionSymbol] = useState("");
  const [shares,       setShares]       = useState("");
  const [repeat,       setRepeat]       = useState(false);
  const [formErr,      setFormErr]      = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("player_rules")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false });
    setRules((data as PlayerRule[]) ?? []);
    setLoading(false);
  }, [participantId, supabase]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function saveRule() {
    setFormErr("");

    // Validate
    if (needsSymbol(condType) && !condSymbol.trim()) {
      setFormErr("Choose a stock for the condition."); return;
    }
    if (!condValue || isNaN(Number(condValue))) {
      setFormErr("Enter a valid condition value."); return;
    }
    if (action !== "sell_all" && !actionSymbol.trim()) {
      setFormErr("Choose a stock for the action."); return;
    }
    if ((action === "buy_shares" || action === "sell_shares") && (!shares || isNaN(Number(shares)) || Number(shares) < 1)) {
      setFormErr("Enter a valid number of shares."); return;
    }

    setSaving(true);
    const { error } = await supabase.from("player_rules").insert({
      participant_id:  participantId,
      competition_id:  competitionId,
      condition_type:  condType,
      symbol:          needsSymbol(condType) ? condSymbol.toUpperCase() : null,
      condition_value: Number(condValue),
      action,
      action_symbol:   action !== "sell_all" ? actionSymbol.toUpperCase() : actionSymbol.toUpperCase() || null,
      shares:          action !== "sell_all" ? Number(shares) : null,
      repeat,
    });
    setSaving(false);

    if (error) { setFormErr(error.message); return; }

    // Reset form
    setCondType("price_below"); setCondSymbol(""); setCondValue("");
    setAction("buy_shares"); setActionSymbol(""); setShares("");
    setRepeat(false); setShowForm(false);
    await load();
  }

  async function cancelRule(id: string) {
    await supabase.from("player_rules").update({ status: "cancelled" }).eq("id", id);
    await load();
  }

  const filtered = rules.filter(r =>
    filter === "all" ? true :
    filter === "active" ? r.status === "active" || r.status === "paused" :
    r.status === "triggered"
  );
  const activeCount    = rules.filter(r => r.status === "active").length;
  const triggeredCount = rules.filter(r => r.status === "triggered").length;

  const S = {
    wrap:    { display: "flex", flexDirection: "column" as const, height: "100%" },
    header:  { padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 },
    label:   { fontSize: 10, fontWeight: 700, color: "rgba(232,234,240,0.52)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 },
    tabs:    { display: "flex", gap: 6, marginBottom: 8 },
    tab:     (active: boolean) => ({
      padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" as const, border: "1px solid",
      background: active ? "rgba(125,211,176,0.1)" : "transparent",
      borderColor: active ? "rgba(125,211,176,0.3)" : "rgba(255,255,255,0.08)",
      color: active ? "#7dd3b0" : "rgba(232,234,240,0.52)",
    }),
    addBtn:  {
      width: "100%", padding: "8px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" as const,
      background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80",
      marginTop: 4,
    },
    list:    { flex: 1, overflowY: "auto" as const },
    empty:   { padding: "32px 16px", textAlign: "center" as const },
    form:    { padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" },
    fLabel:  { fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.45)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4, display: "block" as const },
    input:   { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0f172a", color: "#f0ece3", fontSize: 12, outline: "none" },
    select:  { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0f172a", color: "#f0ece3", fontSize: 12, outline: "none" },
    row:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
    saveBtn: { width: "100%", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" as const, background: "#4ade80", color: "#0a0e1a", border: "none", marginTop: 4 },
    cancelB: { width: "100%", padding: 8, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" as const, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,234,240,0.5)", marginTop: 6 },
  };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.label}>Automation Rules</div>
        <div style={S.tabs}>
          {([
            ["active",    `Active${activeCount > 0 ? ` (${activeCount})` : ""}`],
            ["triggered", `Triggered${triggeredCount > 0 ? ` (${triggeredCount})` : ""}`],
            ["all",       "All"],
          ] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setFilter(val)} style={S.tab(filter === val)}>{lbl}</button>
          ))}
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={S.addBtn}>+ New Rule</button>
        )}
      </div>

      {/* Rule builder form */}
      {showForm && (
        <div style={S.form}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7dd3b0", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            New Automation Rule
          </div>

          {/* Condition */}
          <div style={{ marginBottom: 10 }}>
            <label style={S.fLabel}>Condition</label>
            <select value={condType} onChange={e => setCondType(e.target.value as ConditionType)} style={S.select}>
              {(Object.entries(CONDITION_LABELS) as [ConditionType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div style={S.row}>
            {needsSymbol(condType) && (
              <div>
                <label style={S.fLabel}>Stock</label>
                <select value={condSymbol} onChange={e => setCondSymbol(e.target.value)} style={S.select}>
                  <option value="">Select…</option>
                  {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={S.fLabel}>{isPct(condType) ? "Change %" : "Price ($)"}</label>
              <input
                type="number" placeholder={isPct(condType) ? "e.g. -2" : "e.g. 180"}
                value={condValue} onChange={e => setCondValue(e.target.value)}
                style={S.input}
              />
            </div>
          </div>

          {/* Action */}
          <div style={{ marginBottom: 10 }}>
            <label style={S.fLabel}>Action</label>
            <select value={action} onChange={e => setAction(e.target.value as ActionType)} style={S.select}>
              {(Object.entries(ACTION_LABELS) as [ActionType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div style={S.row}>
            <div>
              <label style={S.fLabel}>Stock to {action === "buy_shares" ? "Buy" : "Sell"}</label>
              <select value={actionSymbol} onChange={e => setActionSymbol(e.target.value)} style={S.select}>
                <option value="">Select…</option>
                {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
              </select>
            </div>
            {action !== "sell_all" && (
              <div>
                <label style={S.fLabel}>Shares</label>
                <input
                  type="number" placeholder="e.g. 10" min="1"
                  value={shares} onChange={e => setShares(e.target.value)}
                  style={S.input}
                />
              </div>
            )}
          </div>

          {/* Repeat toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <input type="checkbox" id="repeat" checked={repeat} onChange={e => setRepeat(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#4ade80", cursor: "pointer" }} />
            <label htmlFor="repeat" style={{ fontSize: 11, color: "rgba(232,234,240,0.7)", cursor: "pointer" }}>
              Repeat every time condition is met
            </label>
          </div>
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginBottom: 10 }}>
            {repeat ? "Rule fires on every tick while condition is true." : "Rule fires once, then becomes inactive."}
          </div>

          {formErr && (
            <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{formErr}</div>
          )}

          <button onClick={saveRule} disabled={saving} style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Rule"}
          </button>
          <button onClick={() => { setShowForm(false); setFormErr(""); }} style={S.cancelB}>
            Cancel
          </button>
        </div>
      )}

      {/* Rule list */}
      <div style={S.list}>
        {loading && (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 11, color: "rgba(232,234,240,0.5)" }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: 13, color: "rgba(232,234,240,0.5)", marginBottom: 6 }}>
              {filter === "active" ? "No active rules" : filter === "triggered" ? "No triggered rules yet" : "No rules yet"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.4)", lineHeight: 1.6 }}>
              Rules let you automate trades while the market runs without you.
            </div>
          </div>
        )}

        {filtered.map(rule => {
          const isActive    = rule.status === "active";
          const isTriggered = rule.status === "triggered";
          const isCancelled = rule.status === "cancelled";

          const statusColor =
            isActive    ? "#fbbf24" :
            isTriggered ? "#4ade80" :
            "rgba(232,234,240,0.4)";
          const statusBg =
            isActive    ? "rgba(251,191,36,0.08)" :
            isTriggered ? "rgba(74,222,128,0.08)"  :
            "rgba(255,255,255,0.03)";
          const statusBorder =
            isActive    ? "rgba(251,191,36,0.2)" :
            isTriggered ? "rgba(74,222,128,0.2)"  :
            "rgba(255,255,255,0.06)";

          return (
            <div key={rule.id} style={{
              padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              opacity: isCancelled ? 0.4 : 1,
            }}>
              {/* Status + repeat badge */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em",
                    background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
                    {rule.status}
                  </span>
                  {rule.repeat && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em",
                      background: "rgba(139,92,246,0.08)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.2)" }}>
                      Repeating
                    </span>
                  )}
                </div>
                {rule.trigger_count > 0 && (
                  <span style={{ fontSize: 10, color: "rgba(232,234,240,0.4)" }}>
                    Fired {rule.trigger_count}×
                  </span>
                )}
              </div>

              {/* Description */}
              <div style={{ fontSize: 12, color: "rgba(232,234,240,0.85)", lineHeight: 1.5, marginBottom: 6 }}>
                {ruleDescription(rule)}
              </div>

              {/* Meta */}
              <div style={{ fontSize: 10, color: "rgba(232,234,240,0.4)", marginBottom: isActive ? 8 : 0 }}>
                Created {formatAge(rule.created_at)}
                {rule.triggered_at && ` · Last fired ${formatAge(rule.triggered_at)}`}
              </div>

              {/* Cancel button */}
              {isActive && (
                <button onClick={() => cancelRule(rule.id)}
                  style={{ width: "100%", padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171" }}>
                  Cancel Rule
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
