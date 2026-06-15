import { Link, router } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native"

import { env } from "@/config/env"
import { importVaultBackupWithPairingCode } from "@/vault/vaultService"

type ImportStatus = "idle" | "importing" | "imported" | "failed"

function getImportErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not import this vault backup."

  if (error.message === "vault_unsupported") {
    return "This vault backup version is not supported."
  }

  if (error.message === "vault_invalid" || error instanceof SyntaxError) {
    return "The vault backup returned by the server is invalid."
  }

  if (error.message === "pairing_not_found") {
    return "That pairing code expired or was already used."
  }

  if (error.message === "pairing_failed" || error.message === "pairing_invalid_response") {
    return "Could not import with that pairing code."
  }

  if (error.message === "pairing_network_failed") {
    return `Could not reach ${env.apiBaseUrl}. Use the computer's local network IP address, not localhost.`
  }

  return "Could not import this vault backup."
}

export default function ImportVaultScreen() {
  const [pairingCode, setPairingCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const canImportPairingCode = pairingCode.length === 9 && status !== "importing"

  async function importPairingCode() {
    if (status === "imported") {
      router.replace("/")
      return
    }

    const code = formatPairingCode(pairingCode)

    if (!code) {
      setError("Enter the pairing code from Connected apps.")
      setStatus("failed")
      return
    }

    setError(null)
    setStatus("importing")

    try {
      await importVaultBackupWithPairingCode(code)
      setStatus("imported")
    } catch (importError) {
      console.error(importError)
      setError(getImportErrorMessage(importError))
      setStatus("failed")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Import vault key</Text>
      <Text style={styles.body}>Enter the pairing code from the web app.</Text>
      <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        editable={status !== "importing"}
        maxLength={9}
        onChangeText={(value) => setPairingCode(formatPairingCode(value))}
        placeholder="ABCD-EFGH"
        placeholderTextColor="#8f8778"
        style={styles.codeInput}
        value={pairingCode}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === "imported" ? <Text style={styles.success}>Vault key imported.</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={status !== "imported" && !canImportPairingCode}
        onPress={importPairingCode}
        style={[
          styles.button,
          status !== "imported" && !canImportPairingCode ? styles.disabledButton : null
        ]}
      >
        <Text style={styles.buttonText}>
          {status === "imported" ? "Done" : status === "importing" ? "Importing..." : "Import"}
        </Text>
      </Pressable>
      {status !== "imported" ? (
        <Link href="/" style={styles.link}>
          Back
        </Link>
      ) : null}
    </ScrollView>
  )
}

function formatPairingCode(value: string) {
  const code = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)

  if (code.length <= 4) return code

  return `${code.slice(0, 4)}-${code.slice(4)}`
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
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
  meta: {
    color: "#b9aa94",
    fontSize: 13,
    lineHeight: 19
  },
  codeInput: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#f4efe6",
    color: "#101820",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2
  },
  button: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
  disabledButton: {
    opacity: 0.55
  },
  buttonText: {
    color: "#fff8ef",
    fontSize: 16,
    fontWeight: "800"
  },
  success: {
    color: "#a8d8a0",
    fontSize: 16,
    fontWeight: "700"
  },
  error: {
    color: "#ffb4a8",
    fontSize: 16,
    fontWeight: "700"
  },
  link: {
    color: "#ffb36b",
    fontSize: 16,
    fontWeight: "700"
  }
})
