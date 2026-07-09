import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, font } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{
        tabPress: () => Haptics.selectionAsync(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "android" ? colors.surface2 : "rgba(20,20,26,0.7)",
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={40} tint="dark" style={{ flex: 1 }} />
          ) : null,
        tabBarLabelStyle: { fontFamily: font.semi, fontSize: 11, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Play",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="alert-octagon" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          title: "Rank",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="medal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="abilities"
        options={{
          title: "Abilities",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="lightning-bolt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cosmetics"
        options={{
          title: "Cosmetics",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="palette" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-box" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
