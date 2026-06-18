import { router, useFocusEffect } from "expo-router"
import { useCallback, useRef, useState, type ReactNode } from "react"
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { normalizeCredentialDomain } from "./domainMatching"
import {
  DEFAULT_GENERATED_PASSWORD_LENGTH,
  generatePassword,
  normalizeGeneratedPasswordLength
} from "./passwordGenerator"
import {
  validateCredentialForm,
  type CREDENTIAL_CATEGORY_VALUES,
  type CredentialFormFieldErrors
} from "./credentialFormValidation"

type FormMode = "create" | "edit"
type FormStatus = "idle" | "loading" | "saving" | "locked" | "missing" | "failed"
type CredentialCategory = (typeof CREDENTIAL_CATEGORY_VALUES)[number]

const CREDENTIAL_CATEGORIES: { label: string; value: CredentialCategory }[] = [
  { label: "Login", value: "login" },
  { label: "Secure note", value: "note" },
  { label: "API key", value: "api_key" },
  { label: "Server", value: "server" },
  { label: "Database", value: "database" }
]

interface CredentialFormScreenProps {
  credentialId?: string
  mode: FormMode
}

export function CredentialFormScreen({ credentialId, mode }: CredentialFormScreenProps) {
  const displayNameInputRef = useRef<TextInput>(null)
  const domainInputRef = useRef<TextInput>(null)
  const generatedPasswordLengthInputRef = useRef<TextInput>(null)
  const notesInputRef = useRef<TextInput>(null)
  const passwordInputRef = useRef<TextInput>(null)
  const usernameInputRef = useRef<TextInput>(null)
  const [displayName, setDisplayName] = useState("")
  const [domain, setDomain] = useState("")
  const [category, setCategory] = useState<CredentialCategory>("login")
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [notes, setNotes] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [generatedPasswordLength, setGeneratedPasswordLength] = useState(
    String(DEFAULT_GENERATED_PASSWORD_LENGTH)
  )
  const [generatedPasswordIncludesNumbers, setGeneratedPasswordIncludesNumbers] = useState(true)
  const [generatedPasswordIncludesSymbols, setGeneratedPasswordIncludesSymbols] = useState(false)
  const [status, setStatus] = useState<FormStatus>(mode === "edit" ? "loading" : "idle")
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<CredentialFormFieldErrors>({})
  const canSave = status !== "saving"

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
    setFieldErrors({})

    const validatedForm = validateCredentialForm({
      category,
      displayName,
      domain,
      notes,
      password,
      username
    })

    if (!validatedForm.data) {
      setFieldErrors(validatedForm.errors ?? {})
      setError("Check the highlighted fields.")
      return
    }

    setStatus("saving")

    try {
      if (!(await isVaultUnlocked())) {
        setStatus("locked")
        return
      }

      const encryptedSecretPayload = await encryptCredentialSecretPayload({
        notes: validatedForm.data.notes,
        password: validatedForm.data.password,
        username: validatedForm.data.username
      })
      const credentialPayload = {
        category: validatedForm.data.category,
        displayName: validatedForm.data.displayName,
        domain: normalizeCredentialDomain(validatedForm.data.domain),
        encryptedSecretPayload
      }

      if (mode === "edit") {
        if (!credentialId) throw new Error("credential_missing")
        await updateLocalCredential(credentialId, credentialPayload)
        void syncEncryptedCredentialsInBackground()
        router.back()
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

  function generateNewPassword() {
    try {
      const length = normalizeGeneratedPasswordLength(generatedPasswordLength)

      setGeneratedPasswordLength(String(length))
      setPassword(
        generatePassword({
          includeNumbers: generatedPasswordIncludesNumbers,
          includeSymbols: generatedPasswordIncludesSymbols,
          length
        })
      )
      setError(null)
      setIsGeneratorOpen(false)
    } catch {
      setError("Could not generate a password on this device.")
    }
  }

  function focusNextAfterPassword() {
    if (isGeneratorOpen) {
      generatedPasswordLengthInputRef.current?.focus()
      return
    }

    notesInputRef.current?.focus()
  }

  function togglePasswordGenerator() {
    setIsGeneratorOpen((open) => {
      if (!open) Keyboard.dismiss()

      return !open
    })
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
                onSubmitEditing={() => domainInputRef.current?.focus()}
                placeholder="Enter title"
                ref={displayNameInputRef}
                returnKeyType="next"
                value={displayName}
                error={fieldErrors.displayName}
              />
              <CredentialInput
                autoCapitalize="none"
                label="Domain"
                onChangeText={setDomain}
                onSubmitEditing={() => usernameInputRef.current?.focus()}
                placeholder="example.com"
                ref={domainInputRef}
                returnKeyType="next"
                value={domain}
                error={fieldErrors.domain}
              />
              <CategoryDropdown
                error={fieldErrors.category}
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
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                placeholder="Enter username"
                ref={usernameInputRef}
                returnKeyType="next"
                value={username}
                error={fieldErrors.username}
              />
              <CredentialInput
                autoCapitalize="none"
                action={
                  <View style={styles.passwordFieldActions}>
                    <Pressable
                      accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                      accessibilityRole="button"
                      onPress={() => setIsPasswordVisible((visible) => !visible)}
                      style={styles.fieldActionButton}
                    >
                      <Text style={styles.fieldActionButtonText}>
                        {isPasswordVisible ? "Hide" : "Show"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Generate password"
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isGeneratorOpen }}
                      onPress={togglePasswordGenerator}
                      style={styles.fieldActionButton}
                    >
                      <Text style={styles.fieldActionButtonText}>Generate</Text>
                    </Pressable>
                  </View>
                }
                label="Password"
                onChangeText={setPassword}
                onSubmitEditing={focusNextAfterPassword}
                placeholder="Enter password"
                ref={passwordInputRef}
                returnKeyType="next"
                secureTextEntry={!isPasswordVisible}
                value={password}
                error={fieldErrors.password}
              />
              {isGeneratorOpen ? (
                <PasswordGeneratorPanel
                  includeNumbers={generatedPasswordIncludesNumbers}
                  includeSymbols={generatedPasswordIncludesSymbols}
                  lengthInputRef={generatedPasswordLengthInputRef}
                  length={generatedPasswordLength}
                  onGenerate={generateNewPassword}
                  onLengthSubmit={() => notesInputRef.current?.focus()}
                  onLengthChange={setGeneratedPasswordLength}
                  onNumbersChange={setGeneratedPasswordIncludesNumbers}
                  onSymbolsChange={setGeneratedPasswordIncludesSymbols}
                />
              ) : null}
              <CredentialInput
                label="Notes"
                multiline
                onChangeText={setNotes}
                onSubmitEditing={saveCredential}
                placeholder="Add notes..."
                ref={notesInputRef}
                returnKeyType="done"
                value={notes}
                error={fieldErrors.notes}
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

interface PasswordGeneratorPanelProps {
  includeNumbers: boolean
  includeSymbols: boolean
  length: string
  lengthInputRef: React.RefObject<TextInput | null>
  onGenerate: () => void
  onLengthSubmit: () => void
  onLengthChange: (length: string) => void
  onNumbersChange: (includeNumbers: boolean) => void
  onSymbolsChange: (includeSymbols: boolean) => void
}

function PasswordGeneratorPanel({
  includeNumbers,
  includeSymbols,
  length,
  lengthInputRef,
  onGenerate,
  onLengthSubmit,
  onLengthChange,
  onNumbersChange,
  onSymbolsChange
}: PasswordGeneratorPanelProps) {
  return (
    <View style={styles.generatorPanel}>
      <View style={styles.generatorHeader}>
        <Text style={styles.generatorLabel}>Characters</Text>
        <TextInput
          accessibilityLabel="Generated password length"
          blurOnSubmit={false}
          keyboardType="number-pad"
          onBlur={() => onLengthChange(String(normalizeGeneratedPasswordLength(length)))}
          onChangeText={onLengthChange}
          onSubmitEditing={onLengthSubmit}
          placeholder="20"
          placeholderTextColor="#8f8778"
          ref={lengthInputRef}
          returnKeyType="next"
          style={styles.lengthInput}
          value={length}
        />
      </View>
      <GeneratorOption
        label="Include numbers"
        onValueChange={onNumbersChange}
        value={includeNumbers}
      />
      <GeneratorOption
        label="Include symbols"
        onValueChange={onSymbolsChange}
        value={includeSymbols}
      />
      <Pressable accessibilityRole="button" onPress={onGenerate} style={styles.generatorButton}>
        <Text style={styles.generatorButtonText}>Use generated password</Text>
      </Pressable>
    </View>
  )
}

function GeneratorOption({
  label,
  onValueChange,
  value
}: {
  label: string
  onValueChange: (value: boolean) => void
  value: boolean
}) {
  return (
    <View style={styles.generatorOption}>
      <Text style={styles.generatorOptionText}>{label}</Text>
      <Switch
        onValueChange={onValueChange}
        thumbColor={value ? "#f4efe6" : "#8f8778"}
        trackColor={{ false: "#dfd0b8", true: "#101820" }}
        value={value}
      />
    </View>
  )
}

interface CategoryDropdownProps {
  error?: string
  isOpen: boolean
  onSelect: (category: CredentialCategory) => void
  onToggle: () => void
  value: CredentialCategory
}

function CategoryDropdown({ error, isOpen, onSelect, onToggle, value }: CategoryDropdownProps) {
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
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  )
}

interface CredentialInputProps {
  action?: ReactNode
  error?: string
  autoCapitalize?: "none" | "sentences" | "words" | "characters"
  label: string
  multiline?: boolean
  onChangeText: (value: string) => void
  onSubmitEditing?: () => void | Promise<void>
  placeholder?: string
  ref?: React.RefObject<TextInput | null>
  returnKeyType?: "done" | "go" | "next" | "search" | "send"
  secureTextEntry?: boolean
  value: string
}

function CredentialInput({
  action,
  error,
  autoCapitalize = "sentences",
  label,
  multiline = false,
  onChangeText,
  onSubmitEditing,
  placeholder,
  ref,
  returnKeyType,
  secureTextEntry = false,
  value
}: CredentialInputProps) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {action}
      </View>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        blurOnSubmit={multiline ? true : false}
        multiline={multiline}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor="#8f8778"
        ref={ref}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        value={value}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
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
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  fieldLabel: {
    color: "#6d5f45",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  fieldError: {
    color: "#a33b2a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
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
  fieldActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "#101820"
  },
  fieldActionButtonText: {
    color: "#fff8ef",
    fontSize: 12,
    fontWeight: "900"
  },
  passwordFieldActions: {
    flexDirection: "row",
    gap: 8
  },
  generatorPanel: {
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfd0b8",
    backgroundColor: "#fff8ef"
  },
  generatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  generatorLabel: {
    color: "#6d5f45",
    fontSize: 14,
    fontWeight: "800"
  },
  lengthInput: {
    minWidth: 74,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dfd0b8",
    color: "#101820",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center"
  },
  generatorOption: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  generatorOptionText: {
    color: "#3b4650",
    fontSize: 14,
    fontWeight: "800"
  },
  generatorButton: {
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7b99f"
  },
  generatorButtonText: {
    color: "#101820",
    fontSize: 14,
    fontWeight: "900"
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
