import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { getVaultCryptoCapabilityStatus } from "@/vault/capabilities"
import type { VaultCryptoSelfTestResult } from "@/vault/selfTest"

type DiagnosticsState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "passed"; result: VaultCryptoSelfTestResult }
  | { status: "failed"; error: string }

export default function CryptoDiagnosticsScreen() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({ status: "idle" })
  const capabilities = getVaultCryptoCapabilityStatus()

  async function runDiagnostics() {
    setDiagnostics({ status: "running" })

    try {
      if (capabilities.missing.length > 0) {
        throw new Error(`Missing runtime support: ${capabilities.missing.join(", ")}`)
      }

      const { runVaultCryptoSelfTest } = await import("@/vault/selfTest")

      setDiagnostics({
        status: "passed",
        result: await runVaultCryptoSelfTest()
      })
    } catch (error) {
      setDiagnostics({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Crypto diagnostics</Text>
      <Text style={styles.body}>
        Runtime: {capabilities.missing.length === 0 ? "ready" : capabilities.missing.join(", ")}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={diagnostics.status === "running"}
        onPress={runDiagnostics}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {diagnostics.status === "running" ? "Running..." : "Run self-test"}
        </Text>
      </Pressable>
      {diagnostics.status === "passed" ? (
        <Text style={styles.result}>
          Passed: {Object.values(diagnostics.result).every(Boolean) ? "yes" : "no"}
        </Text>
      ) : null}
      {diagnostics.status === "failed" ? (
        <Text style={styles.error}>Failed: {diagnostics.error}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: "#101820"
  },
  title: {
    color: "#f4efe6",
    fontSize: 30,
    fontWeight: "800"
  },
  body: {
    color: "#d8ccba",
    fontSize: 17,
    lineHeight: 25
  },
  button: {
    alignItems: "center",
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
  result: {
    color: "#a8d8a0",
    fontSize: 16,
    fontWeight: "700"
  },
  error: {
    color: "#ffb4a8",
    fontSize: 16,
    fontWeight: "700"
  }
})
