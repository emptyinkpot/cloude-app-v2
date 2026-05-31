import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { fetchApi } from "@/src/data/api";

interface HistoryPoint {
  ts: string;
  co2: number;
  temperature: number;
  humidity: number;
  alarm: number;
  slope?: number;
}

interface HistoryResponse {
  range: string;
  count: number;
  points: HistoryPoint[];
}

interface AlertItem {
  id: string;
  ts: string;
  level: string;
  co2: number;
  message: string;
}

interface AlertsResponse {
  items: AlertItem[];
}

interface AlertSettings {
  level1: number;
  level2: number;
  notifications: boolean;
}

export default function AnalyticsScreen() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchApi<HistoryResponse>("/api/v1/history/co2?range=24h"),
      fetchApi<AlertsResponse>("/api/v1/alerts"),
      fetchApi<AlertSettings>("/api/v1/analytics/co2-alert-settings")
    ])
      .then(([histRes, alertRes, settingsRes]) => {
        setHistory(histRes.points);
        setAlerts(alertRes.items);
        setSettings(settingsRes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const peak = history.length > 0 ? Math.max(...history.map((p) => p.co2)) : 0;
  const mean = history.length > 0
    ? Math.round(history.reduce((s, p) => s + p.co2, 0) / history.length)
    : 0;

  return (
    <Shell title="趋势分析" subtitle="24小时统计、阈值策略与告警历史">
      {loading ? (
        <Text style={styles.copy}>加载分析数据...</Text>
      ) : (
        <>
          <Card>
            <Text style={styles.heading}>24 小时统计</Text>
            <Text style={styles.big}>均值 {mean} ppm / 峰值 {peak} ppm</Text>
            <Text style={styles.copy}>共 {history.length} 个采样点</Text>
          </Card>

          {settings && (
            <Card>
              <Text style={styles.heading}>阈值策略</Text>
              <View style={styles.row}>
                <Text style={styles.label}>一级预警</Text>
                <Text style={styles.value}>{settings.level1} ppm</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>二级报警</Text>
                <Text style={styles.value}>{settings.level2} ppm</Text>
              </View>
              <Text style={styles.copy}>
                通知: {settings.notifications ? "已开启" : "已关闭"}
              </Text>
            </Card>
          )}

          <Card>
            <Text style={styles.heading}>告警历史</Text>
            {alerts.length === 0 && <Text style={styles.copy}>暂无告警记录</Text>}
            {alerts.map((item) => (
              <View key={item.id} style={styles.alertRow}>
                <Text style={styles.time}>{formatTime(item.ts)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertLevel}>{item.level} ({item.co2} ppm)</Text>
                  <Text style={styles.copy}>{item.message}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </Shell>
  );
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return ts;
  }
}

const styles = StyleSheet.create({
  heading: {
    color: "#60727b",
    fontWeight: "800",
    fontSize: 13,
    textTransform: "uppercase",
    marginBottom: 4
  },
  big: {
    color: "#102027",
    fontWeight: "900",
    fontSize: 22
  },
  copy: {
    color: "#52656f",
    lineHeight: 20,
    fontSize: 14
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
    fontWeight: "900"
  },
  alertRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f4"
  },
  time: {
    color: "#60727b",
    fontWeight: "800",
    width: 48
  },
  alertLevel: {
    color: "#102027",
    fontWeight: "800"
  }
});
