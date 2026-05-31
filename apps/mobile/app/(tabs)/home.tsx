import { useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
// import { LineChart } from "react-native-chart-kit";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { connectRealtime, fetchApi, getCo2LevelColor, getCo2LevelLabel, resolveCo2Level } from "@/src/data/api";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface RealtimeData {
  co2: number;
  temp: number;
  hum: number;
  alarm: number;
  slope?: number;
  eta?: number;
  trend?: number;
  conf?: number;
  env?: number;
  ts: string;
  dev: string;
}

interface RealtimeResponse {
  data: RealtimeData;
  online: boolean;
}

interface HistoryPoint {
  ts: string;
  co2: number;
}

interface HistoryResponse {
  points: HistoryPoint[];
}

interface PredictResponse {
  current: number;
  filtered: number;
  slope: number;
  confidence: number;
  trend: string;
  model: string;
  correlation: { co2_temp: number; co2_hum: number };
  env_factor: number;
  algorithm: string;
  prediction?: { points: { t: string; co2: number }[] };
}

export default function HomeScreen() {
  const [co2, setCo2] = useState(0);
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [slope, setSlope] = useState(0);
  const [eta, setEta] = useState(-1);
  const [conf, setConf] = useState(0);
  const [envFactor, setEnvFactor] = useState(0);
  const [trendLabel, setTrendLabel] = useState("--");
  const [model, setModel] = useState("--");
  const [online, setOnline] = useState(false);
  const [deviceId, setDeviceId] = useState("--");
  const [updatedAt, setUpdatedAt] = useState("--");
  const [co2TempCorr, setCo2TempCorr] = useState(0);
  const [co2HumCorr, setCo2HumCorr] = useState(0);
  const [historyLabels, setHistoryLabels] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<number[]>([]);
  const [predictData, setPredictData] = useState<number[]>([]);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchApi<RealtimeResponse>("/api/v1/realtime/co2")
      .then((res) => {
        setCo2(res.data.co2);
        setTemp(res.data.temp);
        setHum(res.data.hum);
        setSlope(res.data.slope || 0);
        setEta(res.data.eta ?? -1);
        setConf(res.data.conf || 0);
        setEnvFactor(res.data.env || 0);
        setOnline(res.online);
        setDeviceId(res.data.dev || "--");
        setUpdatedAt(res.data.ts || "--");
      })
      .catch(() => {});

    fetchApi<HistoryResponse>("/api/v1/history/co2?range=1h")
      .then((res) => {
        const pts = res.points || [];
        const labels = pts.map(p => {
          const d = new Date(p.ts);
          return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        });
        const data = pts.map(p => p.co2);
        setHistoryLabels(labels);
        setHistoryData(data);
      })
      .catch(() => {});

    fetchApi<PredictResponse>("/api/v1/predict/co2")
      .then((res) => {
        setTrendLabel(res.trend);
        setModel(res.model);
        setConf(res.confidence);
        setEnvFactor(res.env_factor);
        setCo2TempCorr(res.correlation.co2_temp);
        setCo2HumCorr(res.correlation.co2_hum);
        if (res.prediction?.points) {
          setPredictData(res.prediction.points.map(p => p.co2));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    disconnectRef.current = connectRealtime((data: RealtimeData) => {
      setCo2(data.co2);
      setTemp(data.temp);
      setHum(data.hum);
      setSlope(data.slope || 0);
      setEta(data.eta ?? -1);
      setConf(data.conf || 0);
      setEnvFactor(data.env || 0);
      setOnline(true);
      setDeviceId(data.dev || "--");
      setUpdatedAt(data.ts || "--");
    });
    return () => { disconnectRef.current?.(); };
  }, []);

  const level = resolveCo2Level(co2);
  const levelColor = getCo2LevelColor(level);

  return (
    <Shell title="CO2 监测总览" subtitle="实时浓度、趋势预测与多变量融合分析">
      <Card>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.label}>当前 CO2</Text>
            <Text style={[styles.co2Value, { color: levelColor }]}>{co2} ppm</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: levelColor }]}>
            <Text style={styles.pillText}>{getCo2LevelLabel(level)}</Text>
          </View>
        </View>
        <View style={styles.onlineRow}>
          <View style={[styles.dot, { backgroundColor: online ? "#1f6f5f" : "#b3261e" }]} />
          <Text style={styles.note}>{online ? "设备在线" : "设备离线"} / {deviceId} / 5s 采样</Text>
        </View>
        <View style={styles.grid}>
          <Metric label="温度" value={`${temp.toFixed(1)} °C`} />
          <Metric label="湿度" value={`${hum.toFixed(1)}% RH`} />
          <Metric label="变化率" value={`${slope > 0 ? "+" : ""}${slope} ppm/min`} />
          <Metric label="ETA" value={eta > 0 ? `${eta}s` : "--"} />
        </View>
        <Text style={styles.note}>更新: {updatedAt}</Text>
      </Card>

      {/* 折线图暂时禁用，排查白屏问题
      {historyData.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>CO2 趋势曲线</Text>
          <LineChart
            data={{
              labels: historyLabels.filter((_, i) => i % Math.ceil(historyLabels.length / 6) === 0),
              datasets: [
                { data: historyData, color: () => "#4fc3f7", strokeWidth: 2 },
                ...(predictData.length > 0 ? [{
                  data: [...new Array(historyData.length).fill(0), ...predictData],
                  color: () => "#ffaa00",
                  strokeWidth: 2,
                  withDots: false,
                }] : []),
              ],
            }}
            width={SCREEN_WIDTH - 64}
            height={180}
            yAxisSuffix=" ppm"
            chartConfig={{
              backgroundGradientFrom: "#ffffff",
              backgroundGradientTo: "#ffffff",
              color: (opacity = 1) => `rgba(79, 195, 247, ${opacity})`,
              labelColor: () => "#60727b",
              decimalPlaces: 0,
              propsForDots: { r: "0" },
            }}
            bezier
            style={{ marginLeft: -16, borderRadius: 8 }}
            withInnerLines={false}
            withOuterLines={false}
          />
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#4fc3f7" }]} />
              <Text style={styles.legendText}>实际值</Text>
            </View>
            {predictData.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ffaa00" }]} />
                <Text style={styles.legendText}>预测值</Text>
              </View>
            )}
          </View>
        </Card>
      )}
      */}

      <Card>
        <Text style={styles.sectionTitle}>多变量融合预测</Text>
        <View style={styles.grid}>
          <Metric label="置信度" value={`${conf}%`} />
          <Metric label="环境因子" value={`${envFactor}%`} />
          <Metric label="趋势" value={trendLabel} />
          <Metric label="模型" value={model} />
        </View>
        <View style={styles.grid}>
          <Metric label="CO2-温度相关" value={`${co2TempCorr}`} />
          <Metric label="CO2-湿度相关" value={`${co2HumCorr}`} />
        </View>
        <Text style={styles.note}>算法: 自适应回归 + 温湿度融合 + Holt-Winters</Text>
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
  pill: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  pillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13
  },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 8
  },
  metricBox: {
    width: "47%",
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
  sectionTitle: {
    color: "#102027",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8
  },
  legendRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    color: "#60727b",
    fontSize: 12
  }
});
