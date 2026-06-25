import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.borderDim,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.brandTeal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "500", marginTop: -2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Markets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: "Trade",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-horizontal" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="compete"
        options={{
          title: "Compete",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
