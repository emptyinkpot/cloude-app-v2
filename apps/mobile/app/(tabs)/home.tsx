import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { connectRealtime, fetchApi, getCo2LevelColor, getCo2LevelLabel, resolveCo2Level } from "@/src/data/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = Math.max(280, SCREEN_WIDTH - 96);
const CHART_HEIGHT = 190;
const CHART_PAD = { top: 14, right: 12, bottom: 28, left: 42 };

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
  current?: number | null;
  filtered?: number | null;
  slope?: number;
  confidence?: number;
  trend?: string;
  model?: string;
  correlation?: { co2_temp: number; co2_hum: number };
  env_factor?: number;
  algorithm?: string;
  error?: { mae: number | null; rmse: number | null; samples: number; basis: string };
  prediction?: { points: { t: string; co2: number }[] };
}

interface ChartPoint {
  label: string;
  value: number;
  time: number;
}

interface PredictionPoint {
  t: string;
  co2: number;
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
  const [predictionMae, setPredictionMae] = useState<number | null>(null);
  const [predictionRmse, setPredictionRmse] = useState<number | null>(null);
  const [historyPoints, setHistoryPoints] = useState<ChartPoint[]>([]);
  const [predictData, setPredictData] = useState<PredictionPoint[]>([]);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function loadPrediction() {
      fetchApi<PredictResponse>("/api/v1/predict/co2")
        .then((res) => {
          setTrendLabel(res.trend ?? "--");
          setModel(res.model ?? "--");
          setConf(normalizePercent(res.confidence));
          setEnvFactor(normalizePercent(res.env_factor));
          setCo2TempCorr(res.correlation?.co2_temp ?? 0);
          setCo2HumCorr(res.correlation?.co2_hum ?? 0);
          setPredictionMae(res.error?.mae ?? null);
          setPredictionRmse(res.error?.rmse ?? null);
          if (res.prediction?.points) {
            setPredictData(res.prediction.points);
          }
        })
        .catch(() => {});
    }

    fetchApi<RealtimeResponse>("/api/v1/realtime/co2")
      .then((res) => {
        setCo2(res.data.co2);
        setTemp(res.data.temp);
        setHum(res.data.hum);
        setSlope(res.data.slope || 0);
        setEta(res.data.eta ?? -1);
        setConf(normalizePercent(res.data.conf));
        setEnvFactor(normalizePercent(res.data.env));
        setOnline(res.online);
        setDeviceId(res.data.dev || "--");
        setUpdatedAt(res.data.ts || "--");
      })
      .catch(() => {});

    fetchApi<HistoryResponse>("/api/v1/history/co2?range=1h")
      .then((res) => {
        const pts = res.points || [];
        setHistoryPoints(pts.map((p) => {
          const d = new Date(p.ts);
          return {
            label: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`,
            value: p.co2,
            time: d.getTime()
          };
        }));
      })
      .catch(() => {});

    loadPrediction();
    const predictionTimer = setInterval(loadPrediction, 60000);
    return () => clearInterval(predictionTimer);
  }, []);

  useEffect(() => {
    disconnectRef.current = connectRealtime((data: RealtimeData) => {
      setCo2(data.co2);
      setTemp(data.temp);
      setHum(data.hum);
      setSlope(data.slope || 0);
      setEta(data.eta ?? -1);
      setConf(normalizePercent(data.conf));
      setEnvFactor(normalizePercent(data.env));
      setOnline(true);
      setDeviceId(data.dev || "--");
      setUpdatedAt(data.ts || "--");
      setHistoryPoints((points) => {
        const d = data.ts ? new Date(data.ts) : new Date();
        const next = [
          ...points,
          {
            label: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`,
            value: data.co2,
            time: d.getTime()
          }
        ];
        return next.slice(-720);
      });
    });
    return () => { disconnectRef.current?.(); };
  }, []);

  const level = resolveCo2Level(co2);
  const levelColor = getCo2LevelColor(level);
  const chartPoints = useMemo(() => downsamplePoints(historyPoints, 90), [historyPoints]);

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

      {chartPoints.length > 1 && (
        <Card>
          <Text style={styles.sectionTitle}>CO2 趋势曲线</Text>
          <Co2TrendChart
            actual={chartPoints}
            prediction={predictData}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
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

      <Card>
        <Text style={styles.sectionTitle}>多变量融合预测</Text>
        <View style={styles.grid}>
          <Metric label="置信度" value={`${conf}%`} />
          <Metric label="环境因子" value={`${envFactor}%`} />
          <Metric label="趋势" value={trendLabel} />
          <Metric label="模型" value={model} />
        </View>
        <View style={styles.grid}>
          <Metric label="平均误差" value={predictionMae !== null ? `±${predictionMae} ppm` : "--"} />
          <Metric label="RMSE" value={predictionRmse !== null ? `${predictionRmse} ppm` : "--"} />
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

function Co2TrendChart({
  actual,
  prediction,
  width,
  height
}: {
  actual: ChartPoint[];
  prediction: PredictionPoint[];
  width: number;
  height: number;
}) {
  const actualValues = actual.map((point) => point.value);
  const predictionValues = prediction.map((point) => point.co2);
  const values = [...actualValues, ...predictionValues].filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const yMin = Math.max(0, Math.floor((rawMin - 40) / 50) * 50);
  const yMax = Math.ceil((rawMax + 40) / 50) * 50;
  const plotWidth = width - CHART_PAD.left - CHART_PAD.right;
  const plotHeight = height - CHART_PAD.top - CHART_PAD.bottom;
  const hasPrediction = prediction.length > 0;
  const firstActualTime = actual[0]?.time ?? Date.now();
  const lastActualTime = actual[actual.length - 1]?.time ?? firstActualTime;
  const predictionLeadMs = hasPrediction
    ? Math.max(...prediction.map((point) => parsePredictionLeadMs(point.t)))
    : 0;
  const timelineStart = firstActualTime;
  const timelineEnd = Math.max(lastActualTime + predictionLeadMs, lastActualTime + 1);
  const toTimelineX = (time: number) =>
    CHART_PAD.left + ((time - timelineStart) / Math.max(1, timelineEnd - timelineStart)) * plotWidth;
  const toY = (value: number) =>
    CHART_PAD.top + ((yMax - value) / Math.max(1, yMax - yMin)) * plotHeight;
  const actualPath = buildPath(
    actualValues,
    (index) => toTimelineX(actual[index].time),
    toY
  );
  const predictionSeries = hasPrediction
    ? [
        { value: actualValues[actualValues.length - 1], time: lastActualTime },
        ...prediction.map((point) => ({
          value: point.co2,
          time: lastActualTime + parsePredictionLeadMs(point.t)
        }))
      ]
    : [];
  const predictionPath = buildPath(
    predictionSeries.map((point) => point.value),
    (index) => toTimelineX(predictionSeries[index].time),
    toY
  );
  const lastActual = actual[actual.length - 1];
  const firstLabel = actual[0]?.label ?? "--";
  const lastLabel = lastActual?.label ?? "--";
  const lastActualX = toTimelineX(lastActualTime);
  const lastLabelX = hasPrediction
    ? Math.min(Math.max(CHART_PAD.left, lastActualX - 20), width - CHART_PAD.right - 38)
    : width - CHART_PAD.right - 36;
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const thresholdLines = [1000, 1500].filter((value) => value >= yMin && value <= yMax);

  return (
    <View style={styles.chartSurface}>
      <Svg width={width} height={height}>
        {ticks.map((tick) => {
          const y = toY(tick);
          return (
            <G key={`tick-${tick}`}>
              <Line
                x1={CHART_PAD.left}
                y1={y}
                x2={width - CHART_PAD.right}
                y2={y}
                stroke="#dce7eb"
                strokeWidth={1}
              />
              <SvgText x={8} y={y + 4} fill="#60727b" fontSize={10}>
                {tick}
              </SvgText>
            </G>
          );
        })}
        {thresholdLines.map((threshold) => {
          const y = toY(threshold);
          return (
            <Line
              key={`threshold-${threshold}`}
              x1={CHART_PAD.left}
              y1={y}
              x2={width - CHART_PAD.right}
              y2={y}
              stroke={threshold >= 1500 ? "#ff8a80" : "#ffd180"}
              strokeWidth={1}
              strokeDasharray="5 5"
            />
          );
        })}
        <Path d={actualPath} stroke="#4fc3f7" strokeWidth={3} fill="none" />
        {predictionPath && (
          <Path
            d={predictionPath}
            stroke="#ffaa00"
            strokeWidth={3}
            fill="none"
            strokeDasharray="6 5"
          />
        )}
        <Circle
          cx={lastActualX}
          cy={toY(lastActual.value)}
          r={4}
          fill="#4fc3f7"
        />
        <SvgText x={CHART_PAD.left} y={height - 8} fill="#60727b" fontSize={10}>
          {firstLabel}
        </SvgText>
        <SvgText x={lastLabelX} y={height - 8} fill="#60727b" fontSize={10}>
          {lastLabel}
        </SvgText>
        {hasPrediction && (
          <SvgText x={width - CHART_PAD.right - 38} y={height - 8} fill="#60727b" fontSize={10}>
            {prediction[prediction.length - 1]?.t ?? `+${prediction.length}min`}
          </SvgText>
        )}
        <SvgText x={width - CHART_PAD.right - 52} y={CHART_PAD.top + 12} fill="#102027" fontSize={11}>
          {Math.round(lastActual.value)} ppm
        </SvgText>
      </Svg>
    </View>
  );
}

function normalizePercent(value?: number) {
  if (!Number.isFinite(value)) return 0;
  const percent = value! > 1 ? value! : value! * 100;
  return Math.round(Math.max(0, Math.min(100, percent)));
}

function downsamplePoints(points: ChartPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % stride === 0 || index === points.length - 1);
}

function parsePredictionLeadMs(label: string) {
  const match = /^\+(\d+)\s*(min|m|s)?$/i.exec(label.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  return unit === "s" ? value * 1000 : value * 60 * 1000;
}

function buildPath(
  values: number[],
  toX: (index: number) => number,
  toY: (value: number) => number
) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(1)} ${toY(value).toFixed(1)}`)
    .join(" ");
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
  },
  chartSurface: {
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d9e2e7",
    borderRadius: 8,
    backgroundColor: "#f8fbfc",
    paddingVertical: 4
  }
});
