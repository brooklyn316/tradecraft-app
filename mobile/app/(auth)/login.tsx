import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing, radius, fontSize } from "../../src/theme";

export default function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) Alert.alert("Error", error.message);
      else Alert.alert("Check your email", "Click the confirmation link to activate your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert("Error", error.message);
      else router.replace("/(tabs)");
    }

    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>Tradecraft</Text>
            <Text style={styles.subtitle}>Real stocks. Fake money. Real competition.</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            {[["$10K", "start cash"], ["Real", "data"], ["60s", "refresh"]].map(([v, l]) => (
              <View key={l} style={styles.statCard}>
                <Text style={styles.statValue}>{v}</Text>
                <Text style={styles.statLabel}>{l}</Text>
              </View>
            ))}
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "login" && styles.modeBtnActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.modeBtnText, mode === "login" && styles.modeBtnTextActive]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
              onPress={() => setMode("signup")}
            >
              <Text style={[styles.modeBtnText, mode === "signup" && styles.modeBtnTextActive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === "signup" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="your_handle"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textDim}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitBtnText}>
                {loading ? "..." : mode === "login" ? "Sign in" : "Create account"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  header: { alignItems: "center", marginBottom: spacing.xl },
  logo: { fontSize: 32, fontWeight: "600", color: colors.brandTeal, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  statCard: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center",
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  statValue: { fontSize: fontSize.md, fontWeight: "600", color: colors.textPrimary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  modeToggle: {
    flexDirection: "row", backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    padding: 4, marginBottom: spacing.lg,
    borderWidth: 0.5, borderColor: colors.borderDim,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm - 2, alignItems: "center" },
  modeBtnActive: { backgroundColor: colors.bgCard },
  modeBtnText: { fontSize: fontSize.sm, fontWeight: "500", color: colors.textMuted },
  modeBtnTextActive: { color: colors.textPrimary },
  form: { gap: spacing.md },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: "600", color: colors.textMuted, letterSpacing: 1 },
  input: {
    backgroundColor: colors.bgSecondary, borderWidth: 0.5, borderColor: colors.borderSubtle,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: fontSize.base, color: colors.textPrimary,
  },
  submitBtn: {
    backgroundColor: colors.brandTealDim, borderWidth: 0.5, borderColor: colors.brandTeal,
    borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: fontSize.base, fontWeight: "600", color: colors.brandTeal },
});
