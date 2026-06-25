import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing, radius, fontSize } from "../../src/theme";
import type { StockPrice } from "../../src/types";
import MobileChart from "../../src/components/MobileChart";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const POPULAR_SYMBOLS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "AMD", "NFLX", "COIN"];

export default function MarketsScreen() {
  const [stocks, setStocks] = useState<StockPrice[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [chartType, setChartType] = useState<"candlestick" | "line">("candlestick");
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(60);

  const loadStocks = useCallback(async () => {
    const { data } = await supabase
      .from("stock_prices")
      .select("*")
      .in("symbol", POPULAR_SYMBOLS)
      .order("symbol");

    if (data && data.length > 0) {
      setStocks(data);
      if (!selectedStock) setSelectedStock(data[0]);
    }
    setLoading(false);
  }, [selectedStock]);

  useEffect(() => {
    loadStocks();
    const interval = setInterval(loadStocks, 60_000);
    return () => clearInterval(interval);
  }, [loadStocks]);

  // Countdown timer
  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("mobile_prices")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_prices" }, loadStocks)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadStocks]);

  const isPositive = selectedStock ? (selectedStock.change_percent ?? 0) >= 0 : true;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tradecraft</Text>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{countdown}s</Text>
        </View>
      </View>

      {/* Selected stock price */}
      {selectedStock && (
        <View style={styles.priceBar}>
          <View>
            <Text style={styles.priceSymbol}>{selectedStock.symbol}</Text>
            <Text style={styles.priceName} numberOfLines={1}>{selectedStock.company_name}</Text>
          </View>
          <View style={styles.priceRight}>
            <Text style={styles.priceValue}>${selectedStock.price.toFixed(2)}</Text>
            <Text style={[styles.priceChange, { color: isPositive ? colors.up : colors.down }]}>
              {isPositive ? "+" : ""}{(selectedStock.change_percent ?? 0).toFixed(2)}%
            </Text>
          </View>
        </View>
      )}

      {/* Chart type toggle */}
      <View style={styles.chartToggle}>
        <TouchableOpacity
          style={[styles.chartToggleBtn, chartType === "candlestick" && styles.chartToggleBtnActive]}
          onPress={() => setChartType("candlestick")}
        >
          <Text style={[styles.chartToggleBtnText, chartType === "candlestick" && styles.chartToggleBtnTextActive]}>
            Candlestick
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chartToggleBtn, chartType === "line" && styles.chartToggleBtnActive]}
          onPress={() => setChartType("line")}
        >
          <Text style={[styles.chartToggleBtnText, chartType === "line" && styles.chartToggleBtnTextActive]}>
            Line
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      {selectedStock && (
        <View style={styles.chartWrapper}>
          <MobileChart
            symbol={selectedStock.symbol}
            chartType={chartType}
            color={isPositive ? colors.up : colors.down}
          />
        </View>
      )}

      {/* Stock list */}
      {loading ? (
        <ActivityIndicator color={colors.brandTeal} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={(item) => item.symbol}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const isUp = (item.change_percent ?? 0) >= 0;
            const isSelected = item.symbol === selectedStock?.symbol;
            return (
              <TouchableOpacity
                style={[styles.stockRow, isSelected && styles.stockRowSelected]}
                onPress={() => setSelectedStock(item)}
                activeOpacity={0.7}
              >
                <View style={styles.stockLeft}>
                  <Text style={styles.stockSymbol}>{item.symbol}</Text>
                  <Text style={styles.stockName} numberOfLines={1}>{item.company_name}</Text>
                </View>
                <View style={styles.stockRight}>
                  <Text style={styles.stockPrice}>${item.price.toFixed(2)}</Text>
                  <View style={[styles.changeBadge, { backgroundColor: isUp ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)" }]}>
                    <Text style={[styles.changeText, { color: isUp ? colors.up : colors.down }]}>
                      {isUp ? "+" : ""}{(item.change_percent ?? 0).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "600", color: colors.brandTeal },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.up },
  liveText: { fontSize: fontSize.xs, color: colors.textMuted },
  priceBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  priceSymbol: { fontSize: fontSize.xl, fontWeight: "600", color: colors.textPrimary },
  priceName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, maxWidth: 200 },
  priceRight: { alignItems: "flex-end" },
  priceValue: { fontSize: fontSize.xl, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  priceChange: { fontSize: fontSize.sm, fontWeight: "500", marginTop: 2 },
  chartToggle: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    backgroundColor: colors.bgSecondary, borderRadius: radius.sm,
    padding: 3, borderWidth: 0.5, borderColor: colors.borderDim,
  },
  chartToggleBtn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: radius.sm - 2 },
  chartToggleBtnActive: { backgroundColor: colors.bgCard },
  chartToggleBtnText: { fontSize: fontSize.xs, fontWeight: "500", color: colors.textMuted },
  chartToggleBtnTextActive: { color: colors.textPrimary },
  chartWrapper: { height: 200, marginBottom: spacing.sm },
  list: { flex: 1 },
  separator: { height: 0.5, backgroundColor: colors.borderDim, marginHorizontal: spacing.lg },
  stockRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: 12,
  },
  stockRowSelected: { backgroundColor: colors.bgCard },
  stockLeft: { flex: 1 },
  stockSymbol: { fontSize: fontSize.base, fontWeight: "600", color: colors.textPrimary },
  stockName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  stockRight: { alignItems: "flex-end", gap: 4 },
  stockPrice: { fontSize: fontSize.base, fontWeight: "500", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  changeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  changeText: { fontSize: fontSize.xs, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
