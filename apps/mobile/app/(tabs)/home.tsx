import { Dimensions, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { trendPoints } from "@/src/data/mock";

const chartConfig = {
  backgroundGradientFrom: "#fffaf3",
  backgroundGradientTo: "#fffaf3",
  color: () => "#1f6f5f",
  labelColor: () => "#7b6b5c",
  decimalPlaces: 0
};

export default function HomeScreen() {
  return (
    <Shell
      title="Monitoring overview"
      subtitle="Weather, device state, current CO2 concentration, and short forecast in one screen."
    >
      <Card>
        <Text style={styles.label}>Weather</Text>
        <Text style={styles.metric}>26C / 71% RH / Indoor calm airflow</Text>
      </Card>

      <Card>
        <Text style={styles.label}>Device status</Text>
        <Text style={styles.metric}>3 online / 0 offline / BLE bridge stable</Text>
      </Card>

      <Card>
        <Text style={styles.label}>CO2 trend</Text>
        <Text style={styles.metric}>Current 940 ppm</Text>
        <Text style={styles.detail}>Mean 861 ppm / Peak 980 ppm / 30 min forecast 1015 ppm</Text>
        <LineChart
          data={{
            labels: ["6h", "9h", "12h", "15h", "18h", "21h", "24h", "Now"],
            datasets: [{ data: trendPoints }]
          }}
          width={Dimensions.get("window").width - 80}
          height={220}
          yAxisSuffix="ppm"
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
        />
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#8b5e34",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  metric: {
    color: "#24190e",
    fontSize: 22,
    fontWeight: "800"
  },
  detail: {
    color: "#645444",
    fontSize: 14,
    lineHeight: 20
  },
  chart: {
    marginLeft: -24,
    borderRadius: 16
  }
});
