import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { Shell } from "../components/Shell";
import { IconBubble, SectionTitle, StatusPill } from "../components/ui";
import {
  connectRealtime,
  fetchApi,
  getCo2LevelColor,
  getCo2LevelLabel,
  resolveCo2Level
} from "../data/api";

interface RealtimeData {
  co2: number;
  temp: number;
  hum: number;
  alarm: number;
  slope?: number;
  eta?: number;
  trend?: number;
  ts: string;
  dev: string;
  net: string;
  seq: number;
}

interface RealtimeResponse {
  data: RealtimeData;
  online: boolean;
}

interface HistoryPoint {
  ts: string;
  co2: number;
  temperature: number;
  humidity: number;
  alarm: number;
}

interface HistoryResponse {
  range: string;
  count: number;
  points: HistoryPoint[];
}

export default function HomeScreen() {
  const [co2, setCo2] = useState(0);
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [slope, setSlope] = useState(0);
  const [eta, setEta] = useState(-1);
  const [trendWarn, setTrendWarn] = useState(false);
  const [online, setOnline] = useState(false);
  const [deviceId, setDeviceId] = useState("--");
  const [updatedAt, setUpdatedAt] = useState("--");
  const [trendPoints, setTrendPoints] = useState<number[]>([]);
  const [trendLabels, setTrendLabels] = useState<string[]>([]);
  const disconnectRef = useRef<(() => void) | null>(null);

  // Fetch initial snapshot + history
  useEffect(() => {
    fetchApi<RealtimeResponse>("/api/v1/realtime/co2")
      .then((res) => {
        setCo2(res.data.co2);
        setTemp(res.data.temp);
        setHum(res.data.hum);
        setSlope(res.data.slope || 0);
        setEta(res.data.eta ?? -1);
        setTrendWarn(!!(res.data.trend));
        setOnline(res.online);
        setDeviceId(res.data.dev || "--");
        setUpdatedAt(res.data.ts || "--");
      })
      .catch(() => {});

    fetchApi<HistoryResponse>("/api/v1/history/co2?range=6h")
      .then((res) => {
        const pts = res.points.map((p) => p.co2);
        const labels = res.points.map((p) => {
          const d = new Date(p.ts);
          return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        });
        setTrendPoints(pts);
        setTrendLabels(labels);
      })
      .catch(() => {});
  }, []);

  // WebSocket realtime
  useEffect(() => {
    disconnectRef.current = connectRealtime((data: RealtimeData) => {
      setCo2(data.co2);
      setTemp(data.temp);
      setHum(data.hum);
      setSlope(data.slope || 0);
      setEta(data.eta ?? -1);
      setTrendWarn(!!(data.trend));
      setOnline(true);
      setDeviceId(data.dev || "--");
      setUpdatedAt(data.ts || "--");
    });
    return () => { disconnectRef.current?.(); };
  }, []);

  const level = resolveCo2Level(co2);
  const levelColor = getCo2LevelColor(level);
  const maxTrend = trendPoints.length > 0 ? Math.max(...trendPoints) : 1;

  return (
    <Shell eyebrow="LIVE MONITOR" title="CO2 监测总览" subtitle="实时浓度、趋势预测、设备状态和工程验证集中展示。">
      <Card elevated>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.label}>当前 CO2</Text>
            <Text style={[styles.co2Value, { color: levelColor }]}>{co2} ppm</Text>
          </View>
          <StatusPill label={getCo2LevelLabel(level)} tone={level === "normal" ? "good" : level === "warning" ? "warn" : "bad"} />
        </View>
        <View style={styles.healthStrip}>
          <IconBubble name="wifi" color={online ? "#1f6f5f" : "#b3261e"} />
          <View style={styles.healthText}>
            <Text style={styles.healthTitle}>{online ? "设备在线，数据链路正常" : "设备离线"}</Text>
            <Text style={styles.note}>设备 {deviceId} / 采样间隔 5 s</Text>
          </View>
        </View>
        <View style={styles.grid}>
          <Metric label="温度" value={`${temp.toFixed(1)} C`} />
          <Metric label="湿度" value={`${hum.toFixed(1)}% RH`} />
          <Metric label="变化率" value={`${slope > 0 ? "+" : ""}${slope} ppm/min`} />
          <Metric label="预计到达" value={eta > 0 ? `${eta}s` : "--"} />
        </View>
        {trendWarn && (
          <View style={styles.trendWarnBanner}>
            <Text style={styles.trendWarnText}>趋势预警：CO2 浓度上升中，预计 {eta}s 后到达阈值</Text>
          </View>
        )}
        <Text style={styles.note}>更新时间 {updatedAt}</Text>
      </Card>

      <Card>
        <SectionTitle title="6 小时趋势" meta="ppm" />
        {trendPoints.length > 0 ? (
          <View style={styles.trendBox}>
            {trendPoints.map((point, index) => (
              <View key={`${trendLabels[index]}-${index}`} style={styles.trendColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${Math.max(18, Math.round((point / maxTrend) * 100))}%`,
                        backgroundColor: point >= 1000 ? "#b26a00" : levelColor
                      }
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{trendLabels[index] ?? ""}</Text>
                <Text style={styles.barValue}>{point}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.note}>加载趋势数据中...</Text>
        )}
      </Card>
    </Shell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  label: {
    color: "#60727b",
    fontSize: 13,
    fontWeight: "700"
  },
  co2Value: {
    fontSize: 42,
    fontWeight: "900"
  },
  healthStrip: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#f4f9f7",
    borderRadius: 8,
    padding: 10
  },
  healthText: {
    flex: 1
  },
  healthTitle: {
    color: "#102027",
    fontWeight: "900"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metricBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#d9e2e7",
    borderRadius: 8,
    padding: 10
  },
  metricLabel: {
    color: "#60727b",
    fontSize: 12
  },
  metricValue: {
    color: "#102027",
    fontWeight: "800",
    fontSize: 16
  },
  note: {
    color: "#52656f",
    fontSize: 13,
    lineHeight: 19
  },
  trendWarnBanner: {
    backgroundColor: "#fff3e0",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ffb74d"
  },
  trendWarnText: {
    color: "#e65100",
    fontWeight: "700",
    fontSize: 13
  },
  trendBox: {
    height: 210,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    borderWidth: 1,
    borderColor: "#d9e2e7",
    borderRadius: 8,
    padding: 10
  },
  trendColumn: {
    flex: 1,
    alignItems: "center",
    gap: 4
  },
  barTrack: {
    height: 140,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "#edf2f4",
    borderRadius: 4,
    overflow: "hidden"
  },
  barFill: {
    width: "100%",
    borderRadius: 4
  },
  barLabel: {
    color: "#60727b",
    fontSize: 10
  },
  barValue: {
    color: "#102027",
    fontSize: 10,
    fontWeight: "800"
  }
});
