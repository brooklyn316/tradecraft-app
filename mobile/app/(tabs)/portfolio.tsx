import { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing, radius, fontSize } from "../../src/theme";
import type { Holding, StockPrice, CompetitionParticipant, Trade } from "../../src/types";

export default function PortfolioScreen() {
  const [participant, setParticipant] = useState<CompetitionParticipant | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [startingCash, setStartingCash] = useState(10000);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"holdings" | "trades">("holdings");

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: partData } = await supabase
      .from("competition_participants")
      .select("*, competition:competitions(starting_cash)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(1);

    if (!partData || partData.length === 0) return;
    const part = partData[0];
    setParticipant(part);
    setStartingCash(part.competition?.starting_cash ?? 10000);

    const [{ data: holdingData }, { data: tradeData }] = await Promise.all([
      supabase.from("holdings").select("*").eq("participant_id", part.id),
      supabase.from("trades").select("*").eq("participant_id", part.id)
        .order("executed_at", { ascending: false }).limit(20),
    ]);

    const h = holdingData ?? [];
    setHoldings(h);
    setRecentTrades(tradeData ?? []);

    if (h.length > 0) {
      const symbols = h.map((x) => x.symbol);
      const { data: priceData } = await supabase
        .from("stock_prices").select("symbol, price").in("symbol", symbols);
      const pm: Record<string, number> = {};
      priceData?.forEach((p) => { pm[p.symbol] = p.price; });
      setPrices(pm);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // Portfolio math
  const holdingsValue = holdings.reduce((sum, h) => sum + h.shares * (prices[h.symbol] ?? h.avg_cost), 0);
  const cashBalance = participant?.cash_balance ?? 0;
  const totalValue = cashBalance + holdingsValue;
  const totalReturn = totalValue - startingCash;
  const totalReturnPct = (totalReturn / startingCash) * 100;
  const isPositive = totalReturn >= 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Value</Text>
        <Text style={styles.totalValue}>${totalValue.toFixed(2)}</Text>
        <View style={styles.returnRow}>
          <Text style={[styles.returnAmount, { color: isPositive ? colors.up : colors.down }]}>
            {isPositive ? "+" : ""}${Math.abs(totalReturn).toFixed(2)}
          </Text>
          <View style={[styles.returnBadge, { backgroundColor: isPositive ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)" }]}>
            <Text style={[styles.returnPct, { color: isPositive ? colors.up : colors.down }]}>
              {isPositive ? "+" : ""}{totalReturnPct.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Cash + invested breakdown */}
      <View style={styles.breakdownRow}>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownLabel}>Cash</Text>
          <Text style={styles.breakdownValue}>${cashBalance.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownLabel}>Invested</Text>
          <Text style={styles.breakdownValue}>${holdingsValue.toFixed(2)}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["holdings", "trades"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "holdings" ? "Holdings" : "Trade history"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "holdings" ? (
        <FlatList
          data={holdings}
          keyExtractor={(item) => item.symbol}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandTeal} />}
          style={{ flex: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No holdings yet. Buy some stocks!</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const price = prices[item.symbol] ?? item.avg_cost;
            const value = item.shares * price;
            const pnl = value - item.shares * item.avg_cost;
            const pnlPct = (pnl / (item.shares * item.avg_cost)) * 100;
            const isUp = pnl >= 0;
            const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0;

            return (
              <View style={styles.holdingRow}>
                <View style={styles.holdingLeft}>
                  <Text style={styles.holdingSymbol}>{item.symbol}</Text>
                  <Text style={styles.holdingMeta}>{item.shares.toFixed(2)} shares · avg ${item.avg_cost.toFixed(2)}</Text>
                  {/* Allocation bar */}
                  <View style={styles.allocBar}>
                    <View style={[styles.allocFill, {
                      width: `${Math.min(100, allocation)}%` as any,
                      backgroundColor: isUp ? colors.up : colors.down,
                    }]} />
                  </View>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingValue}>${value.toFixed(2)}</Text>
                  <Text style={[styles.holdingPnl, { color: isUp ? colors.up : colors.down }]}>
                    {isUp ? "+" : ""}${pnl.toFixed(2)} ({isUp ? "+" : ""}{pnlPct.toFixed(2)}%)
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={recentTrades}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No trades yet.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.tradeRow}>
              <View style={[styles.tradeTag, { backgroundColor: item.action === "buy" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)" }]}>
                <Text style={[styles.tradeTagText, { color: item.action === "buy" ? colors.up : colors.down }]}>
                  {item.action.toUpperCase()}
                </Text>
              </View>
              <View style={styles.tradeInfo}>
                <Text style={styles.tradeSymbol}>{item.symbol}</Text>
                <Text style={styles.tradeMeta}>{item.shares} shares @ ${item.price.toFixed(2)}</Text>
                <Text style={styles.tradeDate}>
                  {new Date(item.executed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <Text style={[styles.tradeTotal, { color: item.action === "buy" ? colors.down : colors.up }]}>
                {item.action === "buy" ? "-" : "+"}${item.total.toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  title: { fontSize: fontSize.lg, fontWeight: "600", color: colors.textPrimary },
  summaryCard: {
    marginHorizontal: spacing.lg, marginVertical: spacing.md,
    backgroundColor: colors.bgSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 0.8, marginBottom: 6 },
  totalValue: { fontSize: 32, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  returnRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  returnAmount: { fontSize: fontSize.base, fontWeight: "500", fontVariant: ["tabular-nums"] },
  returnBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  returnPct: { fontSize: fontSize.xs, fontWeight: "600", fontVariant: ["tabular-nums"] },
  breakdownRow: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  breakdownCard: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  breakdownLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 4 },
  breakdownValue: { fontSize: fontSize.base, fontWeight: "500", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  tabRow: {
    flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
    marginHorizontal: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.brandTeal },
  tabText: { fontSize: fontSize.sm, fontWeight: "500", color: colors.textMuted },
  tabTextActive: { color: colors.brandTeal },
  separator: { height: 0.5, backgroundColor: colors.borderDim },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  holdingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: spacing.lg, paddingVertical: 14,
  },
  holdingLeft: { flex: 1, marginRight: spacing.md },
  holdingSymbol: { fontSize: fontSize.md, fontWeight: "600", color: colors.textPrimary },
  holdingMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  allocBar: {
    height: 2, backgroundColor: colors.borderDim, borderRadius: 1,
    marginTop: 8, overflow: "hidden",
  },
  allocFill: { height: "100%", borderRadius: 1, opacity: 0.7 },
  holdingRight: { alignItems: "flex-end" },
  holdingValue: { fontSize: fontSize.base, fontWeight: "500", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  holdingPnl: { fontSize: fontSize.xs, marginTop: 3, fontVariant: ["tabular-nums"] },
  tradeRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 12,
  },
  tradeTag: { width: 40, paddingVertical: 4, borderRadius: 6, alignItems: "center", marginRight: 12 },
  tradeTagText: { fontSize: 10, fontWeight: "700" },
  tradeInfo: { flex: 1 },
  tradeSymbol: { fontSize: fontSize.base, fontWeight: "600", color: colors.textPrimary },
  tradeMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  tradeDate: { fontSize: fontSize.xs, color: colors.textDim, marginTop: 1 },
  tradeTotal: { fontSize: fontSize.base, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
