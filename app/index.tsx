import { Link } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { env } from "@/config/env"

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Password Manager Mobile</Text>
        <Text style={styles.title}>Unlock your vault.</Text>
        <Text style={styles.body}>Import your encrypted vault backup to get started.</Text>
        <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>
        <Link href="/import-vault" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Import vault</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#101820"
  },
  card: {
    width: "100%",
    maxWidth: 460,
    gap: 16,
    padding: 24,
    borderRadius: 28,
    backgroundColor: "#f4efe6"
  },
  eyebrow: {
    color: "#6d5f45",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: "#101820",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38
  },
  body: {
    color: "#3b4650",
    fontSize: 17,
    lineHeight: 25
  },
  meta: {
    color: "#59636c",
    fontSize: 13
  },
  button: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
  buttonText: {
    color: "#fff8ef",
    fontSize: 16,
    fontWeight: "800"
  }
})
