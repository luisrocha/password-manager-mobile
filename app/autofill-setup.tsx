import { router } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { openAndroidSettings } from "@/autofill/autofillSettings"

export default function AutofillSetupScreen() {
  const [error, setError] = useState<string | null>(null)

  async function openSettings() {
    setError(null)

    try {
      const opened = await openAndroidSettings()
      if (!opened) setError("Android settings are only available on Android devices.")
    } catch {
      setError("Could not open Android settings on this device.")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Autofill</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Enable autofill</Text>
        <Text style={styles.body}>
          Open Android settings and choose Password Manager as your password or autofill provider.
        </Text>

        <View style={styles.steps}>
          <InstructionStep number="1" text="Open Android settings." />
          <InstructionStep number="2" text="Search for Passwords, passkeys, or Autofill." />
          <InstructionStep number="3" text="Choose Password Manager as the provider." />
        </View>

        <Pressable accessibilityRole="button" onPress={openSettings} style={styles.button}>
          <Text style={styles.buttonText}>Open Android settings</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  )
}

function InstructionStep({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNumber}>{number}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    gap: 18,
    padding: 20,
    paddingTop: 56,
    backgroundColor: "#101820"
  },
  header: {
    gap: 12
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#f4efe6"
  },
  backButtonText: {
    color: "#101820",
    fontSize: 14,
    fontWeight: "900"
  },
  eyebrow: {
    color: "#b9aa94",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  card: {
    gap: 18,
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#f4efe6"
  },
  title: {
    color: "#101820",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34
  },
  body: {
    color: "#3b4650",
    fontSize: 16,
    lineHeight: 23
  },
  steps: {
    gap: 10
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  stepNumber: {
    width: 28,
    height: 28,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#d95d39",
    color: "#fff8ef",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 28,
    textAlign: "center"
  },
  stepText: {
    flex: 1,
    color: "#101820",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  button: {
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
  buttonText: {
    color: "#fff8ef",
    fontSize: 16,
    fontWeight: "800"
  },
  error: {
    color: "#b83f2f",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  }
})
