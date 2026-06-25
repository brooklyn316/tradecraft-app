import { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ScrollView, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing, radius, fontSize } from "../../src/theme";
import type { StockPrice, CompetitionParticipant, Holding } from "../../src/types";

const SYMBOLS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "AMD", "NFLX", "COIN", "SPY", "QQQ"];

export default function TradeScreen() {
  const [stocks, setStocks] = useState<StockPrice[]>([]);
  const [participant, setParticipant] = useState<CompetitionParticipant | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [selected, setSelected] = useState<StockPrice | null>(null);
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [sharesInput, setSharesInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tradeVisible, setTradeVisible] = useState(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: priceData }, { data: partData }] = await Promise.all([
      supabase.from("stock_prices").select("*").in("symbol", SYMBOLS).order("symbol"),
      supabase.from("competition_participants")
        .select("*")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false })
        .limit(1),
    ]);

    if (priceData) setStocks(priceData);

    if (partData && partData.length > 0) {
      setParticipant(partData[0]);
      const { data: holdingData } = await supabase
        .from("holdings")
        .select("*")
        .eq("participant_id", partData[0].id);
      setHoldings(holdingData ?? []);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function executeTrade() {
    if (!selected || !participant || !sharesInput) return;
    const shares = parseFloat(sharesInput);
    if (isNaN(shares) || shares <= 0) { Alert.alert("Invalid shares amount"); return; }

    const total = shares * selected.price;

    if (action === "buy" && total > participant.cash_balance) {
      Alert.alert("Insufficient funds", `You need $${total.toFixed(2)} but only have $${participant.cash_balance.toFixed(2)}`);
      return;
    }

    const holding = holdings.find((h) => h.symbol === selected.symbol);
    if (action === "sell" && (!holding || holding.shares < shares)) {
      Alert.alert("Insufficient shares", "You don't have enough shares to sell.");
      return;
    }

    setLoading(true);

    await supabase.from("trades").insert({
      participant_id: participant.id,
      symbol: selected.symbol,
      company_name: selected.company_name,
      action,
      shares,
      price: selected.price,
      total,
    });

    // Update cash
    const cashDelta = action === "buy" ? -total : total;
    await supabase.from("competition_participants")
      .update({ cash_balance: participant.cash_balance + cashDelta })
      .eq("id", participant.id);

    // Update holdings
    if (action === "buy") {
      if (holding) {
        const newShares = holding.shares + shares;
        const newAvg = (holding.shares * holding.avg_cost + total) / newShares;
        await supabase.from("holdings").update({ shares: newShares, avg_cost: newAvg }).eq("id", holding.id);
      } else {
        await supabase.from("holdings").insert({
          participant_id: participant.id,
          symbol: selected.symbol,
          shares,
          avg_cost: selected.price,
        });
      }
    } else {
      const newShares = holding!.shares - shares;
      if (newShares <= 0.0001) {
        await supabase.from("holdings").delete().eq("id", holding!.id);
      } else {
        await supabase.from("holdings").update({ shares: newShares }).eq("id", holding!.id);
      }
    }

    Alert.alert("Trade executed!", `${action === "buy" ? "Bought" : "Sold"} ${shares} ${selected.symbol} @ $${selected.price.toFixed(2)}`);
    setSharesInput("");
    setTradeVisible(false);
    loadData();
    setLoading(false);
  }

  const holding = selected ? holdings.find((h) => h.symbol === selected.symbol) : null;
  const shares = parseFloat(sharesInput) || 0;
  const total = shares * (selected?.price ?? 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Trade</Text>
        {participant && (
          <Text style={styles.cashLabel}>${participant.cash_balance.toFixed(2)} cash</Text>
        )}
      </View>

      <FlatList
        data={stocks}
        keyExtractor={(item) => item.symbol}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const isUp = (item.change_percent ?? 0) >= 0;
          const myHolding = holdings.find((h) => h.symbol === item.symbol);
          return (
            <TouchableOpacity
              style={styles.stockRow}
              onPress={() => { setSelected(item); setTradeVisible(true); setAction("buy"); setSharesInput(""); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.stockName} numberOfLines={1}>{item.company_name}</Text>
                {myHolding && (
                  <Text style={styles.holdingText}>{myHolding.shares.toFixed(2)} shares held</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                <Text style={[styles.change, { color: isUp ? colors.up : colors.down }]}>
                  {isUp ? "+" : ""}{(item.change_percent ?? 0).toFixed(2)}%
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Trade modal */}
      <Modal visible={tradeVisible} transparent animationType="slide" onRequestClose={() => setTradeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {selected && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalSymbol}>{selected.symbol}</Text>
                    <Text style={styles.modalPrice}>${selected.price.toFixed(2)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setTradeVisible(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Buy/Sell */}
                <View style={styles.actionToggle}>
                  <TouchableOpacity
                    style={[styles.actionBtn, action === "buy" && styles.actionBtnBuy]}
                    onPress={() => setAction("buy")}
                  >
                    <Text style={[styles.actionBtnText, action === "buy" && { color: colors.up }]}>Buy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, action === "sell" && styles.actionBtnSell]}
                    onPress={() => setAction("sell")}
                  >
                    <Text style={[styles.actionBtnText, action === "sell" && { color: colors.down }]}>Sell</Text>
                  </TouchableOpacity>
                </View>

                {/* Shares input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>SHARES</Text>
                  <TextInput
                    style={styles.sharesInput}
                    value={sharesInput}
                    onChangeText={setSharesInput}
                    placeholder="0"
                    placeholderTextColor={colors.textDim}
                    keyboardType="numeric"
                  />
                </View>

                {/* Quick pct buttons */}
                <View style={styles.pctRow}>
                  {[25, 50, 75, 100].map((pct) => (
                    <TouchableOpacity
                      key={pct}
                      style={styles.pctBtn}
                      onPress={() => {
                        if (action === "buy") {
                          const maxShares = Math.floor((participant!.cash_balance * pct / 100) / selected.price);
                          setSharesInput(maxShares.toString());
                        } else if (holding) {
                          const s = Math.floor(holding.shares * pct / 100);
                          setSharesInput(s.toString());
                        }
                      }}
                    >
                      <Text style={styles.pctBtnText}>{pct}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Summary */}
                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Shares</Text>
                    <Text style={styles.summaryValue}>{shares || "—"}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Price per share</Text>
                    <Text style={styles.summaryValue}>${selected.price.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.summaryRow, { borderTopWidth: 0.5, borderTopColor: colors.borderDim, paddingTop: 8 }]}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary, fontSize: fontSize.md }]}>
                      ${total.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.tradeBtn,
                    action === "buy" ? styles.tradeBtnBuy : styles.tradeBtnSell,
                    loading && { opacity: 0.5 },
                  ]}
                  onPress={executeTrade}
                  disabled={loading}
                >
                  <Text style={[styles.tradeBtnText, { color: action === "buy" ? colors.up : colors.down }]}>
                    {loading ? "Processing..." : `${action === "buy" ? "Buy" : "Sell"} ${selected.symbol}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  title: { fontSize: fontSize.lg, fontWeight: "600", color: colors.textPrimary },
  cashLabel: { fontSize: fontSize.sm, color: colors.brandTeal, fontVariant: ["tabular-nums"] },
  list: { paddingBottom: 20 },
  separator: { height: 0.5, backgroundColor: colors.borderDim, marginHorizontal: spacing.lg },
  stockRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: 14,
  },
  symbol: { fontSize: fontSize.md, fontWeight: "600", color: colors.textPrimary },
  stockName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  holdingText: { fontSize: fontSize.xs, color: colors.brandTeal, marginTop: 2 },
  price: { fontSize: fontSize.md, fontWeight: "500", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  change: { fontSize: fontSize.xs, fontWeight: "500", marginTop: 3, fontVariant: ["tabular-nums"] },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: colors.borderDim,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: colors.borderSubtle,
    borderRadius: 2, alignSelf: "center", marginBottom: spacing.lg,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg },
  modalSymbol: { fontSize: fontSize.xl, fontWeight: "600", color: colors.textPrimary },
  modalPrice: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  modalClose: { fontSize: fontSize.md, color: colors.textMuted, padding: 4 },
  actionToggle: {
    flexDirection: "row", backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: 3, marginBottom: spacing.lg,
  },
  actionBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  actionBtnBuy: { backgroundColor: "rgba(74,222,128,0.1)", borderWidth: 0.5, borderColor: "rgba(74,222,128,0.3)" },
  actionBtnSell: { backgroundColor: "rgba(248,113,113,0.1)", borderWidth: 0.5, borderColor: "rgba(248,113,113,0.3)" },
  actionBtnText: { fontSize: fontSize.base, fontWeight: "600", color: colors.textMuted },
  inputGroup: { marginBottom: spacing.sm },
  inputLabel: { fontSize: 10, fontWeight: "600", color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
  sharesInput: {
    backgroundColor: colors.bgCard, borderWidth: 0.5, borderColor: colors.borderSubtle,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: fontSize.xl, color: colors.textPrimary, fontVariant: ["tabular-nums"],
  },
  pctRow: { flexDirection: "row", gap: 8, marginBottom: spacing.lg },
  pctBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    backgroundColor: colors.bgCard, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  pctBtnText: { fontSize: fontSize.xs, fontWeight: "500", color: colors.textMuted },
  summary: {
    backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md,
    gap: 8, marginBottom: spacing.lg, borderWidth: 0.5, borderColor: colors.borderDim,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  summaryValue: { fontSize: fontSize.sm, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  tradeBtn: {
    paddingVertical: 16, alignItems: "center", borderRadius: radius.md,
    borderWidth: 0.5,
  },
  tradeBtnBuy: { backgroundColor: "rgba(74,222,128,0.12)", borderColor: "rgba(74,222,128,0.35)" },
  tradeBtnSell: { backgroundColor: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.3)" },
  tradeBtnText: { fontSize: fontSize.base, fontWeight: "600" },
});
