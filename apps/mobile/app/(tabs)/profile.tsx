import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/Card";
import { Shell } from "@/src/components/Shell";

export default function ProfileScreen() {
  return (
    <Shell
      title="Profile and maintenance"
      subtitle="Bluetooth status, account context, and deployment-side debugging entry points."
    >
      <Card>
        <Text style={styles.name}>Liu Gaopeng</Text>
        <Text style={styles.copy}>Demo account / thesis operator</Text>
      </Card>

      <Card>
        <Text style={styles.heading}>Bluetooth</Text>
        <Text style={styles.copy}>Adapter ready / 2 nearby devices discovered</Text>
        <View style={styles.list}>
          <Text style={styles.copy}>- CO2 Detector BLE</Text>
          <Text style={styles.copy}>- BLE Bridge</Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.heading}>System</Text>
        <Text style={styles.copy}>3 managed devices / 1 active warning policy</Text>
        <Text style={styles.copy}>Prepared for field deployment and close-range debugging.</Text>
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
  name: {
    color: "#24190e",
    fontSize: 22,
    fontWeight: "800"
  },
  copy: {
    color: "#5d4d3f",
    lineHeight: 20,
    fontSize: 14
  },
  list: {
    gap: 4
  }
});
