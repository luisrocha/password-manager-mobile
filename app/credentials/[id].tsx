import * as Clipboard from "expo-clipboard"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { getCachedCredential, type SyncedCredential } from "@/sync/mobileSync"
import {
  decryptCredentialSecretPayload,
  isVaultUnlocked,
  type CredentialSecretPayload
} from "@/vault/vaultService"

type DetailStatus = "loading" | "ready" | "locked" | "missing" | "failed"

export default function CredentialDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [credential, setCredential] = useState<SyncedCredential | null>(null)
  const [secretPayload, setSecretPayload] = useState<CredentialSecretPayload | null>(null)
  const [status, setStatus] = useState<DetailStatus>("loading")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [areNotesVisible, setAreNotesVisible] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      async function loadCredential() {
        setStatus("loading")

        if (!id) {
          setStatus("missing")
          return
        }

        const unlocked = await isVaultUnlocked()
        if (!unlocked) {
          setStatus("locked")
          return
        }

        const cachedCredential = await getCachedCredential(id)
        if (!isActive) return

        if (!cachedCredential) {
          setStatus("missing")
          return
        }

        setCredential(cachedCredential)
        setStatus("ready")
        decryptCredentialSecretPayload(cachedCredential.encryptedSecretPayload)
          .then((payload) => {
            if (isActive) setSecretPayload(payload)
          })
          .catch(() => {
            if (isActive) setStatus("locked")
          })
      }

      loadCredential().catch(() => {
        if (isActive) setStatus("failed")
      })

      return () => {
        isActive = false
        setSecretPayload(null)
        setIsPasswordVisible(false)
        setAreNotesVisible(false)
        setCopyStatus(null)
      }
    }, [id])
  )

  async function revealSecrets() {
    if (!credential) return null
    if (secretPayload) return secretPayload

    try {
      const payload = await decryptCredentialSecretPayload(credential.encryptedSecretPayload)
      setSecretPayload(payload)

      return payload
    } catch (error) {
      console.error(error)
      setStatus("locked")
      return null
    }
  }

  async function togglePassword() {
    await revealSecrets()
    setIsPasswordVisible((visible) => !visible)
  }

  async function toggleNotes() {
    await revealSecrets()
    setAreNotesVisible((visible) => !visible)
  }

  async function copySecret(field: keyof CredentialSecretPayload) {
    const payload = await revealSecrets()
    if (!payload) return

    await Clipboard.setStringAsync(payload[field])
    setCopyStatus(`Copied ${field}`)
    setTimeout(() => setCopyStatus(null), 1200)
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
        <Text style={styles.eyebrow}>Stored item</Text>
      </View>

      {credential ? (
        <View style={styles.card}>
          <Text style={styles.title}>
            {credential.displayName || credential.domain || "Untitled"}
          </Text>
          <Text style={styles.meta}>
            {[credential.domain, credential.category].filter(Boolean).join(" · ")}
          </Text>
          {copyStatus ? <Text style={styles.copyStatus}>{copyStatus}</Text> : null}

          <Field
            label="Username"
            onCopy={() => copySecret("username")}
            value={secretPayload?.username ?? "Decrypting..."}
          />

          <SecretField
            isVisible={isPasswordVisible}
            label="Password"
            onCopy={() => copySecret("password")}
            onToggle={togglePassword}
            value={secretPayload?.password ?? ""}
          />

          <SecretField
            isVisible={areNotesVisible}
            label="Notes"
            multiline
            onCopy={() => copySecret("notes")}
            onToggle={toggleNotes}
            value={secretPayload?.notes ?? ""}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>{getStatusTitle(status)}</Text>
          <Text style={styles.body}>{getStatusMessage(status)}</Text>
          {status === "locked" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/")}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Unlock vault</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}

interface FieldProps {
  label: string
  onCopy?: () => Promise<void>
  value: string
}

function Field({ label, onCopy, value }: FieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.secretHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {onCopy ? (
          <Pressable accessibilityRole="button" onPress={onCopy} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copy</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.fieldValue}>{value || "-"}</Text>
    </View>
  )
}

interface SecretFieldProps extends FieldProps {
  isVisible: boolean
  multiline?: boolean
  onCopy: () => Promise<void>
  onToggle: () => Promise<void>
}

function SecretField({
  isVisible,
  label,
  multiline = false,
  onCopy,
  onToggle,
  value
}: SecretFieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.secretHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldActions}>
          <Pressable accessibilityRole="button" onPress={onCopy} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onToggle} style={styles.revealButton}>
            <Text style={styles.revealButtonText}>{isVisible ? "Hide" : "Reveal"}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.fieldValue, multiline ? styles.multilineValue : null]}>
        {isVisible ? value || "-" : "Hidden"}
      </Text>
    </View>
  )
}

function getStatusTitle(status: DetailStatus) {
  if (status === "locked") return "Vault locked"
  if (status === "missing") return "Item not found"
  if (status === "failed") return "Could not load item"

  return "Loading..."
}

function getStatusMessage(status: DetailStatus) {
  if (status === "locked") return "Unlock your vault to view this stored item."
  if (status === "missing") return "This item is not available in the local cache."
  if (status === "failed") return "Try returning to the vault and opening this item again."

  return "Loading the local cached item."
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
    fontSize: 14,
    lineHeight: 20
  },
  copyStatus: {
    color: "#2f7d47",
    fontSize: 14,
    fontWeight: "800"
  },
  field: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  fieldLabel: {
    color: "#6d5f45",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  fieldValue: {
    color: "#101820",
    fontSize: 17,
    fontWeight: "700"
  },
  multilineValue: {
    fontWeight: "500",
    lineHeight: 24
  },
  secretHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  fieldActions: {
    flexDirection: "row",
    gap: 8
  },
  copyButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7b99f"
  },
  copyButtonText: {
    color: "#3b4650",
    fontSize: 13,
    fontWeight: "900"
  },
  revealButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#101820"
  },
  revealButtonText: {
    color: "#fff8ef",
    fontSize: 13,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
  primaryButtonText: {
    color: "#fff8ef",
    fontSize: 16,
    fontWeight: "900"
  }
})
