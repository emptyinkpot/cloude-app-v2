import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { Shell } from "../components/Shell";
import { IconBubble, SectionTitle, SoftPanel, StatusPill } from "../components/ui";
import { fetchApi } from "../data/api";

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

interface HistoryPoint {
  ts: string;
  co2: number;
  temperature: number;
  humidity: number;
  alarm: number;
  slope?: number;
  eta?: number;
  trend?: number;
}

interface HistoryResponse {
  range: string;
  count: number;
  points: HistoryPoint[];
}

export default function AnalyticsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
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
  const slopePoints = history.filter((p) => p.slope !== undefined).slice(-24);
  const maxSlope = slopePoints.length > 0 ? Math.max(...slopePoints.map((p) => Math.abs(p.slope || 0)), 1) : 1;

  return (
    <Shell eyebrow="RISK ANALYTICS" title="趋势分析" subtitle="阈值策略、告警历史和风险分析。">
      {loading ? (
        <Text style={styles.copy}>加载分析数据...</Text>
      ) : (
        <>
          <Card elevated>
            <View style={styles.predictionTop}>
              <IconBubble name="trending-up" color="#b26a00" />
              <StatusPill label={`峰值 ${peak} ppm`} tone={peak >= (settings?.level1 ?? 1000) ? "warn" : "good"} />
            </View>
            <Text style={styles.heading}>24 小时统计</Text>
            <Text style={styles.big}>均值 {mean} ppm / 峰值 {peak} ppm</Text>
            <Text style={styles.copy}>共 {history.length} 个采样点。</Text>
          </Card>

          {slopePoints.length > 0 && (
            <Card>
              <SectionTitle title="变化率趋势" meta="ppm/min" />
              <View style={styles.slopeChart}>
                {slopePoints.map((p, i) => {
                  const s = p.slope || 0;
                  const h = Math.max(4, Math.round((Math.abs(s) / maxSlope) * 60));
                  const color = s > 10 ? "#e65100" : s > 0 ? "#b26a00" : "#1f6f5f";
                  return (
                    <View key={i} style={styles.slopeCol}>
                      <View style={[styles.slopeBar, { height: h, backgroundColor: color }]} />
                      <Text style={styles.slopeVal}>{s > 0 ? "+" : ""}{s}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.copy}>橙色 = 上升趋势 / 绿色 = 下降或稳定</Text>
            </Card>
          )}

          {settings && (
            <Card>
              <SectionTitle title="阈值策略" meta="Settings" />
              <SoftPanel>
                <View style={styles.thresholdRow}>
                  <Text style={styles.thresholdLabel}>一级预警</Text>
                  <Text style={styles.thresholdValue}>{settings.level1} ppm</Text>
                </View>
              </SoftPanel>
              <SoftPanel>
                <View style={styles.thresholdRow}>
                  <Text style={styles.thresholdLabel}>二级报警</Text>
                  <Text style={styles.thresholdValue}>{settings.level2} ppm</Text>
                </View>
              </SoftPanel>
              <Text style={styles.copy}>通知: {settings.notifications ? "已开启" : "已关闭"}</Text>
            </Card>
          )}

          <Card>
            <SectionTitle title="告警历史" meta="Events" />
            {alerts.length === 0 && <Text style={styles.copy}>暂无告警记录。</Text>}
            {alerts.map((item) => (
              <SoftPanel key={item.id}>
                <View style={styles.eventRow}>
                  <Text style={styles.time}>{formatTime(item.ts)}</Text>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventLevel}>{item.level} ({item.co2} ppm)</Text>
                    <Text style={styles.copy}>{item.message}</Text>
                  </View>
                </View>
              </SoftPanel>
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
  predictionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  heading: {
    color: "#60727b",
    fontWeight: "800",
    fontSize: 13
  },
  big: {
    color: "#102027",
    fontWeight: "900",
    fontSize: 26
  },
  copy: {
    color: "#52656f",
    lineHeight: 20,
    fontSize: 14
  },
  thresholdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  thresholdLabel: {
    color: "#102027",
    fontWeight: "700"
  },
  thresholdValue: {
    color: "#1f6f5f",
    fontWeight: "900"
  },
  eventRow: {
    flexDirection: "row",
    gap: 12
  },
  time: {
    color: "#60727b",
    fontWeight: "800",
    width: 48
  },
  eventCopy: {
    flex: 1,
    gap: 2
  },
  eventLevel: {
    color: "#102027",
    fontWeight: "800"
  },
  slopeChart: {
    height: 100,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 3,
    borderWidth: 1,
    borderColor: "#d9e2e7",
    borderRadius: 8,
    padding: 8
  },
  slopeCol: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  slopeBar: {
    width: "100%",
    borderRadius: 3
  },
  slopeVal: {
    color: "#60727b",
    fontSize: 9
  }
});
