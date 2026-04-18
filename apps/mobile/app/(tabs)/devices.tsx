import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { devices } from "@/src/data/mock";

export default function DevicesScreen() {
  return (
    <Shell
      title="Unified devices"
      subtitle="Filterable device list for sensor reading, connectivity state, and remote control."
    >
      {devices.map((device) => (
        <Card key={device.id}>
          <Text style={styles.name}>{device.name}</Text>
          <Text style={styles.meta}>
            {device.type} / {device.connectivity} / {device.isOnline ? "online" : "offline"}
          </Text>
          <Text style={styles.value}>{device.currentValue}</Text>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>{device.isOn ? "Turn off" : "Turn on"}</Text>
          </Pressable>
        </Card>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  name: {
    color: "#24190e",
    fontSize: 20,
    fontWeight: "800"
  },
  meta: {
    color: "#8b5e34",
    fontSize: 13,
    textTransform: "uppercase"
  },
  value: {
    color: "#5d4d3f",
    fontSize: 15
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#1f6f5f",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonText: {
    color: "#f6fbf8",
    fontWeight: "700"
  }
});
