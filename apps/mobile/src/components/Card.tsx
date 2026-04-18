import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffaf3",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e3d7c4",
    gap: 10
  }
});
