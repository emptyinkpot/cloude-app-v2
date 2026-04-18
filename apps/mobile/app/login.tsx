import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function LoginScreen() {
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

        <Link href="/(tabs)/home" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Sign in with demo account</Text>
          </Pressable>
        </Link>

        <Text style={styles.helper}>
          Demo account keeps the thesis workflow reproducible for screenshots and
          live presentation.
        </Text>
      </View>
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
  }
});
