import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

import {
  completeAutofill,
  getAutofillDebugState,
  getPendingAutofillRequest,
  type AutofillRequest
} from "@/autofill/autofillSettings"
import { credentialMatchesDomain, normalizeCredentialDomain } from "@/credentials/domainMatching"
import { getCachedCredentials, type LocalCredential } from "@/sync/mobileSync"
import {
  decryptCredentialSecretPayload,
  isVaultUnlocked,
  unlockImportedVault
} from "@/vault/vaultService"

type Status = "checking" | "locked" | "ready" | "filling" | "failed"
type AutofillCredential = LocalCredential & {
  searchText: string
  username: string
}

interface AutofillFillScreenProps {
  onFinished?: () => void
}

export function AutofillFillScreen({ onFinished }: AutofillFillScreenProps = {}) {
  const mountedRef = useRef(true)
  const [credentials, setCredentials] = useState<AutofillCredential[]>([])
  const [request, setRequest] = useState<AutofillRequest | null>(null)
  const [masterPassword, setMasterPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [status, setStatus] = useState<Status>("checking")
  const [error, setError] = useState<string | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const requestingDomain = request?.webDomain || request?.packageName || ""
  const copy = getAutofillCopy(status, requestingDomain)
  const searchableCredentials = useMemo(
    () => [...credentials].sort(compareCredentials),
    [credentials]
  )
  const visibleCredentials = useMemo(
    () => filterAutofillCredentials(searchableCredentials, deferredSearchQuery),
    [searchableCredentials, deferredSearchQuery]
  )
  const fillCredential = useCallback(
    async (credential: LocalCredential) => {
      if (status === "filling") {
        return
      }

      let stage = "decrypt credential"
      setError(null)
      setStatus("filling")

      try {
        const secret = await decryptCredentialSecretPayload(credential.encryptedSecretPayload)
        stage = "native completeAutofill"
        await withTimeout(completeAutofill(secret.username, secret.password), 5000)
        stage = "close autofill screen"
        onFinished?.()
      } catch (caughtError) {
        setStatus("ready")
        const debugState = await getAutofillDebugState().catch(() => null)
        const formattedError = formatAutofillError(stage, caughtError, debugState)
        console.error("[Autofill] Fill failed.", {
          error: formatUnknownError(caughtError),
          nativeState: debugState,
          stage
        })
        setError(formattedError)
      }
    },
    [onFinished, status]
  )

  useEffect(() => {
    let isActive = true
    mountedRef.current = true

    async function loadAutofillRequest() {
      const [pendingRequest, unlocked, cache] = await Promise.all([
        getPendingAutofillRequest(),
        isVaultUnlocked(),
        getCachedCredentials()
      ])
      if (!isActive) return
      const autofillCredentials = cache.credentials.map(buildLockedAutofillCredential)

      if (!pendingRequest) {
        await waitForAutofillRequestRetry()
        if (!isActive) return

        const retriedRequest = await getPendingAutofillRequest()
        if (!isActive) return

        if (!retriedRequest) {
          setStatus("failed")
          setError("No active autofill request.")
          return
        }

        setRequest(retriedRequest)
        setCredentials(autofillCredentials)
        setSearchQuery((currentQuery) => currentQuery || getDefaultSearchQuery(retriedRequest))
        setStatus(unlocked ? "ready" : "locked")
        if (unlocked) {
          Keyboard.dismiss()
          scheduleCredentialUsernameHydration(cache.credentials, () => isActive, setCredentials)
        }
        return
      }

      setRequest(pendingRequest)
      setCredentials(autofillCredentials)
      setSearchQuery((currentQuery) => currentQuery || getDefaultSearchQuery(pendingRequest))
      setStatus(unlocked ? "ready" : "locked")
      if (unlocked) {
        Keyboard.dismiss()
        scheduleCredentialUsernameHydration(cache.credentials, () => isActive, setCredentials)
      }
    }

    loadAutofillRequest().catch(() => {
      if (!isActive) return

      console.error("[Autofill] Failed to load autofill credentials.")
      setStatus("failed")
      setError("Could not load autofill credentials.")
    })

    return () => {
      isActive = false
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (status !== "checking") Keyboard.dismiss()
  }, [status])

  if (status === "checking") {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingTrack}>
          <View style={styles.loadingBar} />
        </View>
      </View>
    )
  }

  async function unlock() {
    if (!masterPassword || status !== "locked") return

    setError(null)

    try {
      await unlockImportedVault(masterPassword)
      setMasterPassword("")
      setStatus("ready")
      Keyboard.dismiss()
      scheduleCredentialUsernameHydration(credentials, () => mountedRef.current, setCredentials)
    } catch {
      setError("Password is incorrect or failed to unlock vault.")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Autofill</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        {status === "locked" ? (
          <>
            <View style={styles.passwordInputRow}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setMasterPassword}
                onSubmitEditing={unlock}
                placeholder="Master password"
                placeholderTextColor="#8f8778"
                secureTextEntry={!isPasswordVisible}
                style={styles.passwordInput}
                value={masterPassword}
              />
              <Pressable
                accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                accessibilityRole="button"
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                style={styles.passwordToggle}
              >
                <Text style={styles.passwordToggleText}>{isPasswordVisible ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!masterPassword}
              onPress={unlock}
              style={[styles.button, !masterPassword ? styles.disabledButton : null]}
            >
              <Text style={styles.buttonText}>Unlock</Text>
            </Pressable>
          </>
        ) : null}

        {status === "ready" || status === "filling" ? (
          <>
            <View style={styles.searchRow}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setSearchQuery}
                placeholder="Search items"
                placeholderTextColor="#8f8778"
                style={styles.searchInput}
                value={searchQuery}
              />
              {searchQuery ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  onPress={() => setSearchQuery("")}
                  style={styles.searchClearButton}
                >
                  <Text style={styles.searchClearButtonText}>×</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.credentialList}>
              {visibleCredentials.length > 0 ? (
                visibleCredentials.map((credential) => (
                  <AutofillCredentialRow
                    credential={credential}
                    disabled={status === "filling"}
                    key={credential.id}
                    onPress={fillCredential}
                  />
                ))
              ) : (
                <Text style={styles.meta}>No matching credentials stored on this device.</Text>
              )}
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

function formatAutofillError(stage: string, error: unknown, debugState: unknown) {
  return [
    `Failed at: ${stage}`,
    `Error: ${formatUnknownError(error)}`,
    debugState ? `Native state: ${JSON.stringify(debugState, null, 2)}` : null
  ]
    .filter(Boolean)
    .join("\n\n")
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === "string") return error

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function waitForAutofillRequestRetry() {
  return new Promise((resolve) => {
    setTimeout(resolve, 150)
  })
}

interface AutofillCredentialRowProps {
  credential: AutofillCredential
  disabled: boolean
  onPress: (credential: AutofillCredential) => void
}

const AutofillCredentialRow = memo(function AutofillCredentialRow({
  credential,
  disabled,
  onPress
}: AutofillCredentialRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onPress(credential)}
      style={styles.credentialRow}
    >
      <Text style={styles.credentialTitle}>
        {credential.displayName || credential.domain || "Untitled"}
      </Text>
      {credential.username ? (
        <Text style={styles.credentialUsername}>{credential.username}</Text>
      ) : null}
      <Text style={styles.credentialMeta}>
        {[credential.domain, credential.category].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  )
})

function filterAutofillCredentials(credentials: AutofillCredential[], searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  if (!normalizedSearchQuery) return credentials

  return credentials.filter(
    (credential) =>
      credential.searchText.includes(normalizedSearchQuery) ||
      credentialMatchesDomain(credential, normalizedSearchQuery)
  )
}

function scheduleCredentialUsernameHydration(
  credentials: LocalCredential[],
  isActive: () => boolean,
  setCredentials: (credentials: AutofillCredential[]) => void
) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      void hydrateCredentialUsernames(credentials, isActive, setCredentials)
    }, 0)
  })
}

async function hydrateCredentialUsernames(
  credentials: LocalCredential[],
  isActive: () => boolean,
  setCredentials: (credentials: AutofillCredential[]) => void
) {
  const hydratedCredentials: AutofillCredential[] = []

  for (const credential of credentials) {
    if (!isActive()) return

    const username = await decryptCredentialSecretPayload(credential.encryptedSecretPayload)
      .then((secret) => secret.username)
      .catch(() => "")

    hydratedCredentials.push(buildAutofillCredential(credential, username))

    if (hydratedCredentials.length % 4 === 0) {
      await yieldToUi()
    }
  }

  if (isActive()) setCredentials(hydratedCredentials)
}

function yieldToUi() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function getDefaultSearchQuery(request: AutofillRequest) {
  if (request.webDomain) return normalizeCredentialDomain(request.webDomain) || request.webDomain

  const packageParts = request.packageName.split(".").filter(Boolean)
  const packageName = packageParts.at(-1) ?? request.packageName

  if (packageName === "browser" && packageParts.length > 1) {
    return packageParts.at(-2) ?? packageName
  }

  return packageName
}

function buildLockedAutofillCredential(credential: LocalCredential): AutofillCredential {
  return buildAutofillCredential(credential, "")
}

function buildAutofillCredential(
  credential: LocalCredential,
  username: string
): AutofillCredential {
  return {
    ...credential,
    username,
    searchText: [
      credential.displayName,
      credential.domain,
      normalizeCredentialDomain(credential.domain),
      credential.category
    ]
      .join(" ")
      .toLowerCase()
  }
}

function getAutofillCopy(status: Status, requestingDomain: string) {
  if (status === "locked") {
    return {
      title: "Unlock the vault",
      body: "Unlock to access the vault."
    }
  }

  return {
    title: "Choose a login",
    body: requestingDomain
      ? `Fill a credential for ${requestingDomain}.`
      : "Fill a credential from this device."
  }
}

function compareCredentials(first: LocalCredential, second: LocalCredential) {
  const firstLabel = (first.displayName || first.domain || "").toLowerCase()
  const secondLabel = (second.displayName || second.domain || "").toLowerCase()
  const labelComparison = firstLabel.localeCompare(secondLabel)
  if (labelComparison !== 0) return labelComparison

  return first.id.localeCompare(second.id)
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#101820"
  },
  loadingTrack: {
    width: "44%",
    maxWidth: 180,
    height: 5,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#2b3742"
  },
  loadingBar: {
    width: "58%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
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
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#fff8ef",
    color: "#101820",
    fontSize: 16,
    fontWeight: "700"
  },
  passwordInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  passwordInput: {
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#fff8ef",
    color: "#101820",
    fontSize: 16,
    fontWeight: "700"
  },
  searchClearButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#d9d1c2"
  },
  searchClearButtonText: {
    color: "#59636c",
    fontSize: 20,
    fontWeight: "900"
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
  disabledButton: {
    opacity: 0.55
  },
  credentialList: {
    gap: 10
  },
  credentialRow: {
    gap: 4,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  credentialTitle: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "800"
  },
  credentialMeta: {
    color: "#59636c",
    fontSize: 13
  },
  credentialUsername: {
    color: "#34414c",
    fontSize: 14,
    fontWeight: "700"
  },
  error: {
    color: "#b83f2f",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  }
})
