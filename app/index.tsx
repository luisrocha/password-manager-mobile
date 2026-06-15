import { Link, useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { env } from "@/config/env"
import {
  hasImportedVaultBackup,
  isVaultUnlocked,
  lockVault,
  unlockImportedVault
} from "@/vault/vaultService"

type UnlockStatus = "idle" | "unlocking" | "unlocked" | "failed"

function getUnlockErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not unlock this vault."

  if (error.message === "vault_missing") return "Import your vault key first."

  return "Master password is incorrect or this vault could not be unlocked."
}

export default function HomeScreen() {
  const [hasImportedVault, setHasImportedVault] = useState(false)
  const [masterPassword, setMasterPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [status, setStatus] = useState<UnlockStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const canUnlock = hasImportedVault && masterPassword.length > 0 && status !== "unlocking"

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      Promise.all([hasImportedVaultBackup(), isVaultUnlocked()])
        .then(([isImported, unlocked]) => {
          if (!isActive) return

          setHasImportedVault(isImported)
          setStatus(unlocked ? "unlocked" : "idle")
        })
        .catch(() => {
          if (!isActive) return

          setHasImportedVault(false)
          setStatus("idle")
        })

      return () => {
        isActive = false
      }
    }, [])
  )

  async function unlock() {
    if (!canUnlock) return

    setError(null)
    setStatus("unlocking")

    try {
      await unlockImportedVault(masterPassword)
      setMasterPassword("")
      setStatus("unlocked")
    } catch (unlockError) {
      console.error(unlockError)
      setError(getUnlockErrorMessage(unlockError))
      setStatus("failed")
    }
  }

  async function lock() {
    await lockVault()
    setMasterPassword("")
    setError(null)
    setStatus("idle")
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Password Manager Mobile</Text>
        <Text style={styles.title}>Unlock your vault.</Text>
        <Text style={styles.body}>
          {hasImportedVault
            ? "Your encrypted vault backup is stored on this device."
            : "Import your encrypted vault backup to get started."}
        </Text>
        <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>

        {hasImportedVault ? (
          status === "unlocked" ? (
            <>
              <Text style={styles.success}>Vault unlocked.</Text>
              <Pressable onPress={lock} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Lock vault</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.passwordInputRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={status !== "unlocking"}
                  onChangeText={setMasterPassword}
                  onSubmitEditing={unlock}
                  placeholder="Master password"
                  placeholderTextColor="#8f8778"
                  secureTextEntry={!isPasswordVisible}
                  style={styles.input}
                  value={masterPassword}
                />
                <Pressable
                  accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                  accessibilityRole="button"
                  disabled={status === "unlocking"}
                  onPress={() => setIsPasswordVisible((visible) => !visible)}
                  style={styles.passwordToggle}
                >
                  <Text style={styles.passwordToggleText}>
                    {isPasswordVisible ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                disabled={!canUnlock}
                onPress={unlock}
                style={[styles.button, !canUnlock ? styles.disabledButton : null]}
              >
                <Text style={styles.buttonText}>
                  {status === "unlocking" ? "Unlocking..." : "Unlock"}
                </Text>
              </Pressable>
            </>
          )
        ) : (
          <Link href="/import-vault" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Import vault</Text>
            </Pressable>
          </Link>
        )}

        {hasImportedVault ? (
          <Link href="/import-vault" asChild>
            <Pressable style={styles.tertiaryButton}>
              <Text style={styles.tertiaryButtonText}>Replace vault key</Text>
            </Pressable>
          </Link>
        ) : null}

        {__DEV__ ? (
          <Link href="/crypto-diagnostics" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Crypto diagnostics</Text>
            </Pressable>
          </Link>
        ) : null}
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
  passwordInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  input: {
    flex: 1,
    padding: 16,
    color: "#101820",
    fontSize: 16
  },
  passwordToggle: {
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  passwordToggleText: {
    color: "#8d4a30",
    fontSize: 14,
    fontWeight: "800"
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
  },
  disabledButton: {
    opacity: 0.55
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7b99f"
  },
  secondaryButtonText: {
    color: "#3b4650",
    fontSize: 15,
    fontWeight: "800"
  },
  tertiaryButton: {
    alignItems: "center",
    paddingVertical: 8
  },
  tertiaryButtonText: {
    color: "#8d4a30",
    fontSize: 14,
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
