import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AnalyticsScreen from "./(tabs)/analytics";
import DevicesScreen from "./(tabs)/devices";
import HomeScreen from "./(tabs)/home";
import ProfileScreen from "./(tabs)/profile";
import ScenesScreen from "./(tabs)/scenes";

type TabKey = "home" | "analytics" | "devices" | "scenes" | "profile";

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "监测" },
  { key: "analytics", label: "分析" },
  { key: "devices", label: "设备" },
  { key: "scenes", label: "控制" },
  { key: "profile", label: "系统" }
];

export default function AppIndex() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {activeTab === "home" && <HomeScreen />}
        {activeTab === "analytics" && <AnalyticsScreen />}
        {activeTab === "devices" && <DevicesScreen />}
        {activeTab === "scenes" && <ScenesScreen />}
        {activeTab === "profile" && <ProfileScreen />}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4efe6"
  },
  content: {
    flex: 1
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fffaf3",
    borderTopWidth: 1,
    borderTopColor: "#e7d8bf",
    paddingBottom: 12,
    paddingTop: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8
  },
  tabButtonActive: {
    backgroundColor: "#e8f3ef"
  },
  tabText: {
    color: "#7e776f",
    fontSize: 13,
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#1f6f5f"
  }
});
