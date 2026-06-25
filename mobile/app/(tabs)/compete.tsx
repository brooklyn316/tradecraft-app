import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Alert, Share, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing, radius, fontSize } from "../../src/theme";
import type { Competition, CompetitionParticipant } from "../../src/types";

type LeaderboardRow = {
  participant_id: string;
  is_bot: boolean;
  username: string;
  total_value: number;
  return_pct: number;
  rank: number;
  is_me: boolean;
};

export default function CompeteScreen() {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"leaderboard" | "new" | "join">("leaderboard");
  const [userId, setUserId] = useState<string | null>(null);

  // New comp form
  const [compName, setCompName] = useState("");
  const [mode, setMode] = useState<"solo" | "friends" | "bot">("solo");
  const [duration, setDuration] = useState<"week" | "month" | "year">("month");

  // Join form
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); }
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;

    const { data: partData } = await supabase
      .from("competition_participants")
      .select("*, competition:competitions(*)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1);

    if (!partData || partData.length === 0) {
      setTab("new");
      return;
    }

    const part = partData[0];
    setCompetition(part.competition);

    // Load all participants + compute portfolio values
    const { data: allParts } = await supabase
      .from("competition_participants")
      .select("*, profile:profiles(username), holdings(*)")
      .eq("competition_id", part.competition.id);

    if (!allParts) return;

    // Get prices for all held symbols
    const allSymbols = [...new Set(allParts.flatMap((p) => (p.holdings ?? []).map((h: { symbol: string }) => h.symbol)))];
    const { data: priceData } = await supabase.from("stock_prices").select("symbol,price").in("symbol", allSymbols);
    const priceMap: Record<string, number> = {};
    priceData?.forEach((p) => { priceMap[p.symbol] = p.price; });

    const rows: LeaderboardRow[] = allParts.map((p) => {
      const holdingsValue = (p.holdings ?? []).reduce((sum: number, h: { shares: number; symbol: string }) => {
        return sum + h.shares * (priceMap[h.symbol] ?? 0);
      }, 0);
      const totalValue = p.cash_balance + holdingsValue;
      const returnPct = ((totalValue - part.competition.starting_cash) / part.competition.starting_cash) * 100;
      return {
        participant_id: p.id,
        is_bot: p.is_bot,
        username: p.is_bot ? "Market Bot 🤖" : p.profile?.username ?? "Player",
        total_value: totalValue,
        return_pct: returnPct,
        rank: 0,
        is_me: p.user_id === userId,
      };
    });

    rows.sort((a, b) => b.total_value - a.total_value);
    rows.forEach((r, i) => { r.rank = i + 1; });
    setLeaderboard(rows);
  }, [userId]);

  useEffect(() => { if (userId) loadData(); }, [userId, loadData]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function createCompetition() {
    if (!compName.trim() || !userId) { Alert.alert("Give your competition a name"); return; }
    const startDate = new Date().toISOString().split("T")[0];
    const days = duration === "week" ? 7 : duration === "month" ? 30 : 365;
    const endDate = new Date(Date.now() + days * 86_400_000).toISOString().split("T")[0];

    const { data: comp, error } = await supabase.from("competitions").insert({
      name: compName.trim(), creator_id: userId, mode, duration,
      starting_cash: 10000, start_date: startDate, end_date: endDate,
    }).select().single();

    if (error || !comp) { Alert.alert("Error", error?.message); return; }

    await supabase.from("competition_participants").insert({ competition_id: comp.id, user_id: userId, cash_balance: 10000 });
    if (mode === "bot") {
      await supabase.from("competition_participants").insert({
        competition_id: comp.id, user_id: null, is_bot: true, bot_strategy: "index", cash_balance: 10000,
      });
    }

    setCompName("");
    setTab("leaderboard");
    loadData();
    Alert.alert("Competition started!", `Invite code: ${comp.invite_code}`);
  }

  async function joinCompetition() {
    if (!inviteCode.trim() || !userId) return;
    const { data: comp } = await supabase.from("competitions")
      .select("*").eq("invite_code", inviteCode.trim().toUpperCase()).single();

    if (!comp) { Alert.alert("Invalid code", "No competition found with that code."); return; }

    const { error } = await supabase.from("competition_participants").insert({
      competition_id: comp.id, user_id: userId, cash_balance: comp.starting_cash,
    });

    if (error) { Alert.alert("Error", error.message); return; }

    setInviteCode("");
    setTab("leaderboard");
    loadData();
    Alert.alert("Joined!", `You've joined ${comp.name}`);
  }

  const daysLeft = competition
    ? Math.max(0, Math.ceil((new Date(competition.end_date).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{competition?.name ?? "Compete"}</Text>
        {competition && <Text style={styles.daysLeft}>{daysLeft}d left</Text>}
      </View>

      {/* Tab row */}
      <View style={styles.tabRow}>
        {[
          { id: "leaderboard", label: "Leaderboard" },
          { id: "new", label: "New game" },
          { id: "join", label: "Join" },
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id as typeof tab)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "leaderboard" && (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.participant_id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandTeal} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No competition active. Start one below!</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setTab("new")}>
                <Text style={styles.emptyBtnText}>Start a competition</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item, index }) => {
            const medals = ["🥇", "🥈", "🥉"];
            const isPos = item.return_pct >= 0;
            return (
              <View style={[styles.leaderRow, item.is_me && styles.leaderRowMe]}>
                <Text style={styles.medal}>{index < 3 ? medals[index] : `${index + 1}`}</Text>
                <View style={styles.leaderInfo}>
                  <Text style={styles.leaderName}>
                    {item.username}{item.is_me ? "  (you)" : ""}
                  </Text>
                  <Text style={styles.leaderValue}>${item.total_value.toFixed(2)}</Text>
                </View>
                <Text style={[styles.leaderReturn, { color: isPos ? colors.up : colors.down }]}>
                  {isPos ? "+" : ""}{item.return_pct.toFixed(2)}%
                </Text>
              </View>
            );
          }}
        />
      )}

      {tab === "new" && (
        <View style={styles.formContainer}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput
              style={styles.input} value={compName} onChangeText={setCompName}
              placeholder="e.g. March Madness" placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>MODE</Text>
            <View style={styles.optionRow}>
              {(["solo", "friends", "bot"] as const).map((m) => (
                <TouchableOpacity
                  key={m} onPress={() => setMode(m)}
                  style={[styles.optionBtn, mode === m && styles.optionBtnActive]}
                >
                  <Text style={[styles.optionBtnText, mode === m && styles.optionBtnTextActive]}>
                    {m === "bot" ? "vs Bot" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DURATION</Text>
            <View style={styles.optionRow}>
              {(["week", "month", "year"] as const).map((d) => (
                <TouchableOpacity
                  key={d} onPress={() => setDuration(d)}
                  style={[styles.optionBtn, duration === d && styles.optionBtnActive]}
                >
                  <Text style={[styles.optionBtnText, duration === d && styles.optionBtnTextActive]}>
                    {d === "week" ? "1 Week" : d === "month" ? "1 Month" : "1 Year"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.startingCashNote}>
            <Text style={styles.startingCashText}>Everyone starts with $10,000</Text>
          </View>

          <TouchableOpacity style={styles.createBtn} onPress={createCompetition}>
            <Text style={styles.createBtnText}>Start competition</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === "join" && (
        <View style={styles.formContainer}>
          <Text style={styles.joinInstructions}>
            Enter the invite code from a friend to join their competition.
          </Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>INVITE CODE</Text>
            <TextInput
              style={[styles.input, { textTransform: "uppercase", letterSpacing: 4, fontSize: fontSize.xl }]}
              value={inviteCode} onChangeText={setInviteCode}
              placeholder="XXXXXXXX" placeholderTextColor={colors.textDim}
              autoCapitalize="characters" maxLength={8}
            />
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={joinCompetition}>
            <Text style={styles.createBtnText}>Join competition</Text>
          </TouchableOpacity>
        </View>
      )}
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
  daysLeft: { fontSize: fontSize.sm, color: colors.brandTeal },
  tabRow: {
    flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.brandTeal },
  tabText: { fontSize: fontSize.sm, fontWeight: "500", color: colors.textMuted },
  tabTextActive: { color: colors.brandTeal },
  leaderRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg,
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.borderDim,
  },
  leaderRowMe: { backgroundColor: "rgba(125,211,176,0.04)", borderLeftWidth: 2, borderLeftColor: colors.brandTeal },
  medal: { width: 28, fontSize: fontSize.lg, textAlign: "center", marginRight: 12 },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: fontSize.base, fontWeight: "500", color: colors.textPrimary },
  leaderValue: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, fontVariant: ["tabular-nums"] },
  leaderReturn: { fontSize: fontSize.base, fontWeight: "600", fontVariant: ["tabular-nums"] },
  empty: { padding: 40, alignItems: "center", gap: 16 },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  emptyBtn: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.brandTealDim, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.brandTeal,
  },
  emptyBtnText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brandTeal },
  formContainer: { padding: spacing.lg, gap: spacing.lg },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "600", color: colors.textMuted, letterSpacing: 1 },
  input: {
    backgroundColor: colors.bgSecondary, borderWidth: 0.5, borderColor: colors.borderSubtle,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: fontSize.base, color: colors.textPrimary,
  },
  optionRow: { flexDirection: "row", gap: 8 },
  optionBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    backgroundColor: colors.bgSecondary, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  optionBtnActive: { backgroundColor: colors.brandTealDim, borderColor: colors.brandTeal },
  optionBtnText: { fontSize: fontSize.sm, fontWeight: "500", color: colors.textMuted },
  optionBtnTextActive: { color: colors.brandTeal },
  startingCashNote: {
    backgroundColor: colors.bgSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  startingCashText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  createBtn: {
    paddingVertical: 16, alignItems: "center", borderRadius: radius.md,
    backgroundColor: colors.brandTealDim, borderWidth: 0.5, borderColor: colors.brandTeal,
  },
  createBtnText: { fontSize: fontSize.base, fontWeight: "600", color: colors.brandTeal },
  joinInstructions: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 22 },
});
