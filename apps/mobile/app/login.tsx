import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { connectRealtime, fetchApi } from "@/src/data/api";

type RealtimeData = {
  co2: number;
  temp: number;
  hum: number;
  slope?: number;
  eta?: number;
  conf?: number;
  env?: number;
  ts: string;
  dev: string;
};

type RealtimeResponse = {
  data: RealtimeData;
  online: boolean;
};

type PredictResponse = {
  confidence: number;
  trend: string;
  model: string;
  env_factor: number;
  correlation: { co2_temp: number; co2_hum: number };
};

export default function LoginScreen() {
  const [signedIn, setSignedIn] = useState(true);

  if (signedIn) {
    return <DashboardScreen />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.kicker}>Cloude App</Text>
        <Text style={styles.title}>CO2 detection companion</Text>
        <Text style={styles.copy}>
          Thesis companion app for remote visualization, warning explanation,
          device control, and maintenance workflows.
        </Text>

        <TextInput style={styles.input} defaultValue="demo@cloude.app" />
        <TextInput style={styles.input} defaultValue="123456" secureTextEntry />

        <Pressable style={styles.button} onPress={() => setSignedIn(true)}>
          <Text style={styles.buttonText}>Sign in with demo account</Text>
        </Pressable>

        <Text style={styles.helper}>
          Demo account keeps the thesis workflow reproducible for screenshots and
          live presentation.
        </Text>
      </View>
    </View>
  );
}

function DashboardScreen() {
  const [co2, setCo2] = useState(0);
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [slope, setSlope] = useState(0);
  const [eta, setEta] = useState(-1);
  const [confidence, setConfidence] = useState(0);
  const [envFactor, setEnvFactor] = useState(0);
  const [trend, setTrend] = useState("--");
  const [model, setModel] = useState("--");
  const [deviceId, setDeviceId] = useState("--");
  const [online, setOnline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("--");
  const [co2TempCorr, setCo2TempCorr] = useState(0);
  const [co2HumCorr, setCo2HumCorr] = useState(0);

  useEffect(() => {
    fetchApi<RealtimeResponse>("/api/v1/realtime/co2")
      .then((res) => {
        setRealtime(res.data, res.online);
      })
      .catch(() => {});

    fetchApi<PredictResponse>("/api/v1/predict/co2")
      .then((res) => {
        setConfidence(res.confidence);
        setEnvFactor(res.env_factor);
        setTrend(res.trend);
        setModel(res.model);
        setCo2TempCorr(res.correlation.co2_temp);
        setCo2HumCorr(res.correlation.co2_hum);
      })
      .catch(() => {});

    const disconnect = connectRealtime((data) => {
      setRealtime(data, true);
    });
    return disconnect;
  }, []);

  function setRealtime(data: RealtimeData, isOnline: boolean) {
    setCo2(data.co2);
    setTemp(data.temp);
    setHum(data.hum);
    setSlope(data.slope || 0);
    setEta(data.eta ?? -1);
    setConfidence(data.conf || confidence);
    setEnvFactor(data.env || envFactor);
    setDeviceId(data.dev || "--");
    setUpdatedAt(data.ts || "--");
    setOnline(isOnline);
  }

  const level = co2 >= 1500 ? "危险" : co2 >= 1000 ? "预警" : "正常";
  const levelColor = co2 >= 1500 ? "#b3261e" : co2 >= 1000 ? "#b26a00" : "#1f6f5f";

  return (
    <ScrollView style={styles.dashboard} contentContainerStyle={styles.dashboardContent}>
      <Text style={styles.dashboardTitle}>CO2 监测总览</Text>
      <Text style={styles.dashboardSubtitle}>实时浓度、趋势预测与多变量融合分析</Text>

      <View style={styles.dataCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.metricLabel}>当前 CO2</Text>
            <Text style={[styles.co2Value, { color: levelColor }]}>{co2} ppm</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: levelColor }]}>
            <Text style={styles.statusText}>{level}</Text>
          </View>
        </View>
        <Text style={styles.copy}>
          {online ? "设备在线" : "设备离线"} / {deviceId} / 5s 采样
        </Text>
        <View style={styles.metricGrid}>
          <Metric label="温度" value={`${temp.toFixed(1)} °C`} />
          <Metric label="湿度" value={`${hum.toFixed(1)}% RH`} />
          <Metric label="变化率" value={`${slope > 0 ? "+" : ""}${slope} ppm/min`} />
          <Metric label="ETA" value={eta > 0 ? `${eta}s` : "--"} />
        </View>
        <Text style={styles.copy}>更新: {updatedAt}</Text>
      </View>

      <View style={styles.dataCard}>
        <Text style={styles.sectionTitle}>多变量融合预测</Text>
        <View style={styles.metricGrid}>
          <Metric label="置信度" value={`${confidence}%`} />
          <Metric label="环境因子" value={`${envFactor}%`} />
          <Metric label="趋势" value={trend} />
          <Metric label="模型" value={model} />
          <Metric label="CO2-温度相关" value={`${co2TempCorr}`} />
          <Metric label="CO2-湿度相关" value={`${co2HumCorr}`} />
        </View>
        <Text style={styles.copy}>算法: 自适应回归 + 温湿度融合 + Holt-Winters</Text>
      </View>
    </ScrollView>
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
  container: {
    flex: 1,
    backgroundColor: "#f4efe6",
    justifyContent: "center",
    padding: 24
  },
  panel: {
    backgroundColor: "#fffaf3",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2d3bc",
    gap: 14
  },
  kicker: {
    color: "#8b5e34",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  title: {
    color: "#21160b",
    fontSize: 28,
    fontWeight: "800"
  },
  copy: {
    color: "#584636",
    fontSize: 15,
    lineHeight: 22
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0d1bb",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  button: {
    backgroundColor: "#1f6f5f",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center"
  },
  buttonText: {
    color: "#f7fbf9",
    fontWeight: "700"
  },
  helper: {
    color: "#6c5b49",
    fontSize: 13,
    lineHeight: 20
  },
  dashboard: {
    flex: 1,
    backgroundColor: "#f4efe6"
  },
  dashboardContent: {
    padding: 20,
    paddingTop: 58,
    gap: 16
  },
  dashboardTitle: {
    color: "#22170b",
    fontSize: 28,
    fontWeight: "800"
  },
  dashboardSubtitle: {
    color: "#5e4d3d",
    fontSize: 14,
    lineHeight: 20
  },
  dataCard: {
    backgroundColor: "#fffaf3",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e3d7c4",
    gap: 10
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  co2Value: {
    fontSize: 42,
    fontWeight: "900"
  },
  statusPill: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  statusText: {
    color: "#fff",
    fontWeight: "800"
  },
  copy: {
    color: "#52656f",
    fontSize: 13,
    lineHeight: 19
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
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
    fontSize: 12,
    fontWeight: "700"
  },
  metricValue: {
    color: "#102027",
    fontWeight: "800",
    fontSize: 16
  },
  sectionTitle: {
    color: "#102027",
    fontSize: 18,
    fontWeight: "900"
  }
});
