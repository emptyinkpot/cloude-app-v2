import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { alertHistory } from "@/src/data/mock";

export default function AnalyticsScreen() {
  return (
    <Shell
      title="Trend analysis"
      subtitle="24-hour fit, 2-hour forecast, warning thresholds, and alert history."
    >
      <Card>
        <Text style={styles.heading}>Forecast</Text>
        <Text style={styles.big}>2h projection: 1120 ppm</Text>
        <Text style={styles.copy}>
          Current curve slope suggests the room will cross the level-1 threshold
          within the next hour unless ventilation starts.
        </Text>
      </Card>

      <Card>
        <Text style={styles.heading}>Alert settings</Text>
        <Text style={styles.copy}>Level-1: 1000 ppm / Level-2: 1500 ppm</Text>
        <Text style={styles.copy}>Strategy: warn early, keep logs, suggest scene actions.</Text>
      </Card>

      <Card>
        <Text style={styles.heading}>Alert history</Text>
        {alertHistory.map((item) => (
          <View key={item} style={styles.row}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.copy}>{item}</Text>
          </View>
        ))}
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: "#8b5e34",
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase"
  },
  big: {
    color: "#24190e",
    fontWeight: "800",
    fontSize: 24
  },
  copy: {
    color: "#5d4d3f",
    lineHeight: 20,
    fontSize: 14
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start"
  },
  bullet: {
    color: "#1f6f5f",
    fontWeight: "900",
    fontSize: 16
  }
});
