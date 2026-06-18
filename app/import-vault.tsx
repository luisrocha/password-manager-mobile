import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

import { env } from "@/config/env"
import { importVaultBackupWithPairingCode } from "@/vault/vaultService"

type ImportStatus = "idle" | "importing" | "imported" | "failed"

function getImportErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not set up this device."

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
    return "Could not pair with that pairing code."
  }

  if (error.message === "pairing_network_failed") {
    return `Could not reach ${env.apiBaseUrl}. Use the computer's local network IP address, not localhost.`
  }

  return "Could not set up this device."
}

export default function ImportVaultScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const isRepairing = mode === "repair"
  const [pairingCode, setPairingCode] = useState("")
  const [deviceName, setDeviceName] = useState(() => inferDefaultDeviceName())
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
      await importVaultBackupWithPairingCode(code, deviceName)
      setStatus("imported")
    } catch (importError) {
      console.error(importError)
      setError(getImportErrorMessage(importError))
      setStatus("failed")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Set up device</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{isRepairing ? "Re-pair device" : "Set up device"}</Text>
        <Text style={styles.body}>Enter the pairing code from the web app.</Text>
        <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          editable={status !== "importing"}
          maxLength={120}
          onChangeText={setDeviceName}
          placeholder="Device name"
          placeholderTextColor="#8f8778"
          style={styles.input}
          value={deviceName}
        />
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
        {status === "imported" ? (
          <Text style={styles.success}>{isRepairing ? "Device re-paired." : "Device set up."}</Text>
        ) : null}
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
            {status === "imported" ? "Done" : status === "importing" ? "Pairing..." : "Pair device"}
          </Text>
        </Pressable>
      </View>
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

function inferDefaultDeviceName() {
  const constants = Platform.constants as Record<string, unknown>
  const values = [
    constants.Manufacturer,
    constants.Brand,
    constants.Model,
    constants.model,
    constants.DeviceName,
    constants.deviceName
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)

  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length > 0) return uniqueValues.join(" ")

  if (Platform.OS === "android") return "Android device"
  if (Platform.OS === "ios") return "iPhone"

  return "Mobile device"
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
    gap: 16,
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
  meta: {
    color: "#59636c",
    fontSize: 13,
    lineHeight: 19
  },
  input: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#c7b99f",
    backgroundColor: "#fff8ef",
    color: "#101820",
    fontSize: 16
  },
  codeInput: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#c7b99f",
    backgroundColor: "#fff8ef",
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
    color: "#2f7d47",
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
