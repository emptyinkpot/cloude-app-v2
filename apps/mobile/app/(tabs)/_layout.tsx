import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1f6f5f",
        tabBarInactiveTintColor: "#7e776f",
        tabBarStyle: {
          backgroundColor: "#fffaf3",
          borderTopColor: "#e7d8bf"
        }
      }}
    >
      <Tabs.Screen name="home" options={{ title: "监测" }} />
      <Tabs.Screen name="analytics" options={{ title: "分析" }} />
      <Tabs.Screen name="devices" options={{ title: "设备" }} />
      <Tabs.Screen name="scenes" options={{ title: "控制" }} />
      <Tabs.Screen name="profile" options={{ title: "系统" }} />
    </Tabs>
  );
}
