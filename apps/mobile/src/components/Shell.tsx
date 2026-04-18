import { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type ShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function Shell({ title, subtitle, children }: ShellProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4efe6"
  },
  content: {
    padding: 20,
    gap: 16
  },
  header: {
    gap: 6
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#22170b"
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5e4d3d"
  }
});
