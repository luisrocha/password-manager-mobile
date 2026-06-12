import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { getVaultCryptoCapabilityStatus } from "@/vault/capabilities"
import { ensureMobileCryptoRuntime } from "@/runtime/installMobileCryptoRuntime"
import type { VaultCryptoDebugSelfTestResult } from "@/vault/debugSelfTest"

type DiagnosticsState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "completed"; result: VaultCryptoDebugSelfTestResult }
  | { status: "failed"; error: string }

export default function CryptoDiagnosticsScreen() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({ status: "idle" })
  const capabilities = getVaultCryptoCapabilityStatus()

  async function runDiagnostics() {
    setDiagnostics({ status: "running" })

    try {
      await ensureMobileCryptoRuntime()
      const latestCapabilities = getVaultCryptoCapabilityStatus()

      if (latestCapabilities.missing.length > 0) {
        throw new Error(`Missing runtime support: ${latestCapabilities.missing.join(", ")}`)
      }

      // Load OpenPGP only after the native WebCrypto runtime is installed.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { runVaultCryptoDebugSelfTest } = require("@/vault/debugSelfTest") as {
        runVaultCryptoDebugSelfTest: () => Promise<VaultCryptoDebugSelfTestResult>
      }

      setDiagnostics({
        status: "completed",
        result: await runVaultCryptoDebugSelfTest()
      })
    } catch (error) {
      setDiagnostics({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Crypto diagnostics</Text>
      <Text style={styles.body}>
        Runtime: {capabilities.missing.length === 0 ? "ready" : capabilities.missing.join(", ")}
      </Text>
      {capabilities.installError ? (
        <Text style={styles.error}>Install error: {capabilities.installError}</Text>
      ) : null}
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
      {diagnostics.status === "completed" ? (
        <View style={styles.output}>
          <Text style={diagnostics.result.failedStep ? styles.error : styles.result}>
            {diagnostics.result.failedStep
              ? `Failed at: ${diagnostics.result.failedStep}`
              : "All diagnostic steps passed"}
          </Text>
          <Text selectable style={styles.debugText}>
            {JSON.stringify(diagnostics.result.steps, null, 2)}
          </Text>
        </View>
      ) : null}
      {diagnostics.status === "failed" ? (
        <Text style={styles.error}>Failed: {diagnostics.error}</Text>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
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
  output: {
    gap: 12
  },
  debugText: {
    color: "#f4efe6",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18
  },
  error: {
    color: "#ffb4a8",
    fontSize: 16,
    fontWeight: "700"
  }
})
