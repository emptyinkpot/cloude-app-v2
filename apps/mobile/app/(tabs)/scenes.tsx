import { Pressable, StyleSheet, Text } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";
import { scenes } from "@/src/data/mock";

export default function ScenesScreen() {
  return (
    <Shell
      title="Scene execution"
      subtitle="One-tap action bundles that prepare the project for linked control expansion."
    >
      {scenes.map((scene) => (
        <Card key={scene.id}>
          <Text style={styles.name}>{scene.name}</Text>
          <Text style={styles.copy}>{scene.description}</Text>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Execute scene</Text>
          </Pressable>
        </Card>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  name: {
    color: "#24190e",
    fontWeight: "800",
    fontSize: 20
  },
  copy: {
    color: "#5e4d3d",
    lineHeight: 20
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#c4652d",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonText: {
    color: "#fffaf3",
    fontWeight: "700"
  }
});
