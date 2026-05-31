import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { fetchApi } from "@/src/data/api";

interface Scene {
  id: string;
  name: string;
  description: string;
  actions: { target: string; value: number }[];
}

const scenes: Scene[] = [
  {
    id: "vent",
    name: "通风模式",
    description: "CO2 超标时手动触发通风提醒，蜂鸣器响铃 + LED 闪烁。",
    actions: [{ target: "beep", value: 1 }, { target: "led", value: 1 }]
  },
  {
    id: "silent",
    name: "静音模式",
    description: "关闭蜂鸣器报警，仅保留 LED 指示和 App 推送。",
    actions: [{ target: "beep", value: 0 }]
  },
  {
    id: "reset",
    name: "复位模式",
    description: "关闭所有外设输出，恢复默认监测状态。",
    actions: [{ target: "beep", value: 0 }, { target: "led", value: 0 }]
  }
];

export default function ScenesScreen() {
  const [executing, setExecuting] = useState<string | null>(null);

  async function executeScene(scene: Scene) {
    setExecuting(scene.id);
    try {
      for (const action of scene.actions) {
        await fetchApi("/api/v1/control", {
          method: "POST",
          body: JSON.stringify(action)
        });
      }
      Alert.alert("执行成功", `${scene.name} 已下发到设备`);
    } catch {
      Alert.alert("执行失败", "无法连接服务器");
    } finally {
      setExecuting(null);
    }
  }

  return (
    <Shell title="场景联动" subtitle="CO2 阈值策略与设备远程控制">
      {scenes.map((scene) => (
        <Card key={scene.id}>
          <Text style={styles.name}>{scene.name}</Text>
          <Text style={styles.copy}>{scene.description}</Text>
          <Pressable
            style={[styles.button, executing === scene.id && styles.buttonDisabled]}
            onPress={() => executeScene(scene)}
            disabled={executing !== null}
          >
            <Text style={styles.buttonText}>
              {executing === scene.id ? "执行中..." : "执行场景"}
            </Text>
          </Pressable>
        </Card>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  name: {
    color: "#102027",
    fontWeight: "900",
    fontSize: 20
  },
  copy: {
    color: "#52656f",
    lineHeight: 20,
    fontSize: 14
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#1f6f5f",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
