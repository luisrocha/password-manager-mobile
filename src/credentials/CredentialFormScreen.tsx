import { router, useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"

import {
  createLocalCredential,
  getCachedCredential,
  syncEncryptedCredentialsInBackground,
  updateLocalCredential
} from "@/sync/mobileSync"
import {
  decryptCredentialSecretPayload,
  encryptCredentialSecretPayload,
  isVaultUnlocked
} from "@/vault/vaultService"

type FormMode = "create" | "edit"
type FormStatus = "idle" | "loading" | "saving" | "locked" | "missing" | "failed"

const CREDENTIAL_CATEGORIES = [
  { label: "Login", value: "login" },
  { label: "Secure note", value: "note" },
  { label: "API key", value: "api_key" },
  { label: "Server", value: "server" },
  { label: "Database", value: "database" }
] as const

type CredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number]["value"]

interface CredentialFormScreenProps {
  credentialId?: string
  mode: FormMode
}

export function CredentialFormScreen({ credentialId, mode }: CredentialFormScreenProps) {
  const [displayName, setDisplayName] = useState("")
  const [domain, setDomain] = useState("")
  const [category, setCategory] = useState<CredentialCategory>("login")
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<FormStatus>(mode === "edit" ? "loading" : "idle")
  const [error, setError] = useState<string | null>(null)
  const canSave =
    status !== "saving" && (displayName.trim() || domain.trim()) && password.length > 0

  useFocusEffect(
    useCallback(() => {
      if (mode !== "edit") return undefined

      let isActive = true

      async function loadCredential() {
        setStatus("loading")

        if (!credentialId) {
          setStatus("missing")
          return
        }

        if (!(await isVaultUnlocked())) {
          setStatus("locked")
          return
        }

        const credential = await getCachedCredential(credentialId)
        if (!isActive) return

        if (!credential) {
          setStatus("missing")
          return
        }

        const secretPayload = await decryptCredentialSecretPayload(
          credential.encryptedSecretPayload
        )
        if (!isActive) return

        setDisplayName(credential.displayName)
        setDomain(credential.domain)
        setCategory(normalizeCredentialCategory(credential.category))
        setUsername(secretPayload.username)
        setPassword(secretPayload.password)
        setNotes(secretPayload.notes)
        setStatus("idle")
      }

      loadCredential().catch(() => {
        if (isActive) setStatus("failed")
      })

      return () => {
        isActive = false
      }
    }, [credentialId, mode])
  )

  async function saveCredential() {
    if (!canSave) return

    setError(null)
    setStatus("saving")

    try {
      if (!(await isVaultUnlocked())) {
        setStatus("locked")
        return
      }

      const encryptedSecretPayload = await encryptCredentialSecretPayload({
        notes,
        password,
        username
      })
      const credentialPayload = {
        category,
        displayName: displayName.trim(),
        domain: domain.trim(),
        encryptedSecretPayload
      }

      if (mode === "edit") {
        if (!credentialId) throw new Error("credential_missing")
        await updateLocalCredential(credentialId, credentialPayload)
        void syncEncryptedCredentialsInBackground()
        router.replace(`/credentials/${encodeURIComponent(credentialId)}`)
      } else {
        const createdCredential = await createLocalCredential(credentialPayload)
        void syncEncryptedCredentialsInBackground()
        router.replace(`/credentials/${encodeURIComponent(createdCredential.id)}`)
      }
    } catch {
      setError("Could not save this item.")
      setStatus("idle")
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={24}
      style={styles.keyboardContainer}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
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

        <View style={styles.card}>
          <Text style={styles.title}>{mode === "edit" ? "Edit item" : "Add item"}</Text>
          {status === "locked" || status === "missing" || status === "failed" ? (
            <>
              <Text style={styles.body}>{getStatusMessage(status)}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/")}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Return to vault</Text>
              </Pressable>
            </>
          ) : (
            <>
              <CredentialInput
                autoCapitalize="words"
                label="Title"
                onChangeText={setDisplayName}
                placeholder="Enter title"
                value={displayName}
              />
              <CredentialInput
                autoCapitalize="none"
                label="Domain"
                onChangeText={setDomain}
                placeholder="example.com"
                value={domain}
              />
              <CategoryDropdown
                isOpen={isCategoryOpen}
                onSelect={(nextCategory) => {
                  setCategory(nextCategory)
                  setIsCategoryOpen(false)
                }}
                onToggle={() => setIsCategoryOpen((open) => !open)}
                value={category}
              />
              <CredentialInput
                autoCapitalize="none"
                label="Username"
                onChangeText={setUsername}
                placeholder="Enter username"
                value={username}
              />
              <CredentialInput
                autoCapitalize="none"
                label="Password"
                onChangeText={setPassword}
                placeholder="Enter password"
                secureTextEntry
                value={password}
              />
              <CredentialInput
                label="Notes"
                multiline
                onChangeText={setNotes}
                value={notes}
                placeholder="Add notes..."
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={!canSave}
                onPress={saveCredential}
                style={[styles.primaryButton, !canSave ? styles.disabledButton : null]}
              >
                <Text style={styles.primaryButtonText}>
                  {status === "saving" ? "Saving..." : "Save item"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

interface CategoryDropdownProps {
  isOpen: boolean
  onSelect: (category: CredentialCategory) => void
  onToggle: () => void
  value: CredentialCategory
}

function CategoryDropdown({ isOpen, onSelect, onToggle, value }: CategoryDropdownProps) {
  const selectedCategory = getCategoryOption(value)

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Category</Text>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.dropdownButton}>
        <Text style={styles.dropdownButtonText}>{selectedCategory.label}</Text>
        <Text style={styles.dropdownIndicator}>{isOpen ? "Hide" : "Choose"}</Text>
      </Pressable>
      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {CREDENTIAL_CATEGORIES.map((categoryOption) => (
            <Pressable
              accessibilityRole="button"
              key={categoryOption.value}
              onPress={() => onSelect(categoryOption.value)}
              style={[
                styles.dropdownOption,
                categoryOption.value === value ? styles.selectedDropdownOption : null
              ]}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  categoryOption.value === value ? styles.selectedDropdownOptionText : null
                ]}
              >
                {categoryOption.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

interface CredentialInputProps {
  autoCapitalize?: "none" | "sentences" | "words" | "characters"
  label: string
  multiline?: boolean
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  value: string
}

function CredentialInput({
  autoCapitalize = "sentences",
  label,
  multiline = false,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value
}: CredentialInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8f8778"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        value={value}
      />
    </View>
  )
}

function getStatusMessage(status: FormStatus) {
  if (status === "locked") return "Unlock your vault before changing stored items."
  if (status === "missing") return "This item is not available on this device."
  if (status === "failed") return "Could not load this item."

  return "Loading..."
}

function getCategoryOption(category: CredentialCategory) {
  return (
    CREDENTIAL_CATEGORIES.find((categoryOption) => categoryOption.value === category) ??
    CREDENTIAL_CATEGORIES[0]
  )
}

function normalizeCredentialCategory(category: string): CredentialCategory {
  const normalizedCategory = category.trim()
  const matchingCategory = CREDENTIAL_CATEGORIES.find(
    (categoryOption) => categoryOption.value === normalizedCategory
  )

  return matchingCategory?.value ?? "login"
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#101820"
  },
  screen: {
    flexGrow: 1,
    gap: 18,
    padding: 20,
    paddingTop: 56,
    paddingBottom: 140,
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
  field: {
    gap: 8
  },
  fieldLabel: {
    color: "#6d5f45",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  input: {
    minHeight: 52,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff8ef",
    color: "#101820",
    fontSize: 16,
    fontWeight: "700"
  },
  dropdownButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff8ef"
  },
  dropdownButtonText: {
    color: "#101820",
    fontSize: 16,
    fontWeight: "800"
  },
  dropdownIndicator: {
    color: "#8d4a30",
    fontSize: 13,
    fontWeight: "900"
  },
  dropdownMenu: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfd0b8",
    backgroundColor: "#fff8ef"
  },
  dropdownOption: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eadcc6"
  },
  selectedDropdownOption: {
    backgroundColor: "#101820"
  },
  dropdownOptionText: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "800"
  },
  selectedDropdownOptionText: {
    color: "#fff8ef"
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  error: {
    color: "#a33b2a",
    fontSize: 14,
    fontWeight: "800"
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
  },
  disabledButton: {
    opacity: 0.45
  }
})
