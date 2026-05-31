import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { fetchApi } from "@/src/data/api";

interface HealthResponse {
  ok: boolean;
  mqtt: boolean;
  lastHeartbeat: number;
}

export default function ProfileScreen() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetchApi<HealthResponse>("/api/v1/health")
      .then(setHealth)
      .catch(() => {});
  }, []);

  const heartbeatAge = health?.lastHeartbeat
    ? Math.max(0, Math.round((Date.now() - health.lastHeartbeat) / 1000))
    : null;
  const heartbeatStr = heartbeatAge !== null
    ? heartbeatAge < 60 ? `${heartbeatAge}s 前` : `${Math.floor(heartbeatAge / 60)}m ${heartbeatAge % 60}s 前`
    : "--";
  const deviceOnline = heartbeatAge !== null && heartbeatAge < 15;

  return (
    <Shell title="系统维护" subtitle="账号信息、系统状态与工程证据">
      <Card>
        <Text style={styles.name}>刘高朋</Text>
        <Text style={styles.copy}>毕业设计演示账号</Text>
      </Card>

      <Card>
        <Text style={styles.heading}>系统状态</Text>
        <View style={styles.row}>
          <Text style={styles.label}>服务状态</Text>
          <Text style={[styles.value, { color: health?.ok ? "#1f6f5f" : "#b3261e" }]}>
            {health?.ok ? "运行中" : "异常"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>MQTT 连接</Text>
          <Text style={[styles.value, { color: health?.mqtt ? "#1f6f5f" : "#b3261e" }]}>
            {health?.mqtt ? "已连接" : "断开"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>设备状态</Text>
          <Text style={[styles.value, { color: deviceOnline ? "#1f6f5f" : "#b3261e" }]}>
            {deviceOnline ? "在线" : "离线"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>最近心跳</Text>
          <Text style={styles.value}>
            {heartbeatStr}
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.heading}>工程信息</Text>
        <View style={styles.row}>
          <Text style={styles.label}>项目</Text>
          <Text style={styles.value}>基于嵌入式的CO2监测与预警器</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>MCU</Text>
          <Text style={styles.value}>STM32F103C8T6</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>传感器</Text>
          <Text style={styles.value}>SCD41 (CO2/温度/湿度)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>通信</Text>
          <Text style={styles.value}>ESP8266 WiFi + MQTT</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>算法</Text>
          <Text style={styles.value}>多变量融合预测 (CO2+T+H)</Text>
        </View>
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  name: {
    color: "#102027",
    fontSize: 24,
    fontWeight: "900"
  },
  copy: {
    color: "#52656f",
    lineHeight: 20,
    fontSize: 14
  },
  heading: {
    color: "#60727b",
    fontWeight: "800",
    fontSize: 13,
    textTransform: "uppercase",
    marginBottom: 8
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f4"
  },
  label: {
    color: "#102027",
    fontWeight: "700"
  },
  value: {
    color: "#1f6f5f",
    fontWeight: "800"
  }
});
