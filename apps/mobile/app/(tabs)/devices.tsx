import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { fetchApi } from "@/src/data/api";

interface Device {
  id: string;
  name: string;
  type: string;
  isOnline: boolean;
  currentValue: number | null;
  unit: string;
  lastSeen: string;
}

interface DevicesResponse {
  items: Device[];
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<DevicesResponse>("/api/v1/devices")
      .then((res) => setDevices(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell title="设备管理" subtitle="检测终端在线状态与实时读数">
      {loading && <Text style={styles.copy}>加载设备列表...</Text>}
      {devices.map((device) => (
        <Card key={device.id}>
          <View style={styles.topRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.name}>{device.name}</Text>
              <Text style={styles.meta}>{device.type}</Text>
            </View>
            <View style={[styles.dot, { backgroundColor: device.isOnline ? "#1f6f5f" : "#b3261e" }]} />
            <Text style={[styles.status, { color: device.isOnline ? "#1f6f5f" : "#b3261e" }]}>
              {device.isOnline ? "在线" : "离线"}
            </Text>
          </View>
          <Text style={styles.value}>
            {device.currentValue != null ? `${device.currentValue} ${device.unit}` : "--"}
          </Text>
          <Text style={styles.copy}>最后上报: {device.lastSeen || "--"}</Text>
        </Card>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  titleBlock: {
    flex: 1
  },
  name: {
    color: "#102027",
    fontSize: 20,
    fontWeight: "900"
  },
  meta: {
    color: "#60727b",
    fontSize: 13
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  status: {
    fontWeight: "800",
    fontSize: 13
  },
  value: {
    color: "#1f6f5f",
    fontSize: 22,
    fontWeight: "900"
  },
  copy: {
    color: "#52656f",
    fontSize: 14,
    lineHeight: 20
  }
});
