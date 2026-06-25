import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"

import {
  completeAutofill,
  getAutofillDebugState,
  getPendingAutofillRequest,
  type AutofillRequest
} from "@/autofill/autofillSettings"
import { normalizeCredentialDomain } from "@/credentials/domainMatching"
import {
  credentialUsernameCacheKey,
  loadCredentialUsernameIndex
} from "@/credentials/credentialUsernameIndex"
import { getCachedCredentials, type LocalCredential } from "@/sync/mobileSync"
import {
  decryptCredentialSecretPayload,
  isVaultUnlocked,
  unlockImportedVault
} from "@/vault/vaultService"

type Status = "checking" | "locked" | "ready" | "filling" | "failed"
type AutofillCredential = LocalCredential & {
  normalizedDomain: string
  searchText: string
}

interface AutofillFillScreenProps {
  onFinished?: () => void
  requestVersion?: number
}

export function AutofillFillScreen({
  onFinished,
  requestVersion = 0
}: AutofillFillScreenProps = {}) {
  const mountedRef = useRef(true)
  const [credentials, setCredentials] = useState<AutofillCredential[]>([])
  const [request, setRequest] = useState<AutofillRequest | null>(null)
  const [targetName, setTargetName] = useState("")
  const [masterPassword, setMasterPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [fillingCredentialKey, setFillingCredentialKey] = useState<string | null>(null)
  const [usernameByCredentialKey, setUsernameByCredentialKey] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status>("checking")
  const [error, setError] = useState<string | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const requestingName = request ? getRequestDisplayName(request) : ""
  const copy = getAutofillCopy(status, requestingName, targetName)
  const searchableCredentials = useMemo(
    () => [...credentials].sort(compareCredentials),
    [credentials]
  )
  const areCredentialUsernamesReady = useMemo(
    () =>
      credentials.every((credential) =>
        Object.hasOwn(usernameByCredentialKey, credentialUsernameCacheKey(credential))
      ),
    [credentials, usernameByCredentialKey]
  )
  const visibleCredentials = useMemo(
    () => filterAutofillCredentials(searchableCredentials, deferredSearchQuery),
    [searchableCredentials, deferredSearchQuery]
  )
  const fillCredential = useCallback(
    async (credential: AutofillCredential) => {
      if (status === "filling") {
        return
      }

      let stage = "decrypt credential"
      setFillingCredentialKey(credentialUsernameCacheKey(credential))
      setError(null)
      setStatus("filling")

      try {
        const secret = await decryptCredentialSecretPayload(credential.encryptedSecretPayload)
        stage = "native completeAutofill"
        await withTimeout(completeAutofill(secret.username, secret.password), 5000)
        stage = "close autofill screen"
        onFinished?.()
      } catch (caughtError) {
        setFillingCredentialKey(null)
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
  const renderCredential = useCallback(
    ({ item }: { item: AutofillCredential }) => (
      <AutofillCredentialRow
        credential={item}
        disabled={status === "filling"}
        onPress={fillCredential}
        isFilling={fillingCredentialKey === credentialUsernameCacheKey(item)}
        username={usernameByCredentialKey[credentialUsernameCacheKey(item)] ?? ""}
      />
    ),
    [fillCredential, fillingCredentialKey, status, usernameByCredentialKey]
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
      const autofillCredentials = cache.credentials.map(buildAutofillCredential)

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

        const defaultSearch = getDefaultSearch(retriedRequest)
        if (!isActive) return

        setRequest(retriedRequest)
        setCredentials(autofillCredentials)
        setTargetName(defaultSearch.targetName)
        setSearchQuery(defaultSearch.query)
        setStatus(unlocked ? "ready" : "locked")
        if (unlocked) {
          Keyboard.dismiss()
          loadCredentialUsernamesFromIndex(
            cache.credentials,
            () => isActive,
            setUsernameByCredentialKey
          )
        }
        return
      }

      const defaultSearch = getDefaultSearch(pendingRequest)
      if (!isActive) return

      setRequest(pendingRequest)
      setCredentials(autofillCredentials)
      setTargetName(defaultSearch.targetName)
      setSearchQuery(defaultSearch.query)
      setStatus(unlocked ? "ready" : "locked")
      if (unlocked) {
        Keyboard.dismiss()
        loadCredentialUsernamesFromIndex(
          cache.credentials,
          () => isActive,
          setUsernameByCredentialKey
        )
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
  }, [requestVersion])

  useEffect(() => {
    if (status !== "checking") Keyboard.dismiss()
  }, [status])

  if (
    status === "checking" ||
    ((status === "ready" || status === "filling") && !areCredentialUsernamesReady)
  ) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#d95d39" size="large" />
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
      loadCredentialUsernamesFromIndex(
        credentials,
        () => mountedRef.current,
        setUsernameByCredentialKey
      )
    } catch {
      setError("Password is incorrect or failed to unlock vault.")
    }
  }

  if (status === "ready" || status === "filling") {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Autofill</Text>
        </View>

        <View style={[styles.card, styles.credentialCard]}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

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

          {visibleCredentials.length > 0 ? (
            <FlatList
              contentContainerStyle={styles.credentialListContent}
              data={visibleCredentials}
              extraData={usernameByCredentialKey}
              keyExtractor={(credential) => credential.id}
              keyboardShouldPersistTaps="handled"
              renderItem={renderCredential}
              showsVerticalScrollIndicator={false}
              style={styles.credentialList}
            />
          ) : (
            <Text style={styles.meta}>No matching credentials stored on this device.</Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    )
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
  isFilling: boolean
  onPress: (credential: AutofillCredential) => void
  username: string
}

const AutofillCredentialRow = memo(function AutofillCredentialRow({
  credential,
  disabled,
  isFilling,
  onPress,
  username
}: AutofillCredentialRowProps) {
  const fillCredential = useCallback(() => {
    onPress(credential)
  }, [credential, onPress])

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "#eadcca" }}
      disabled={disabled}
      onPress={fillCredential}
      style={({ pressed }) => [
        styles.credentialRow,
        pressed ? styles.credentialRowPressed : null,
        isFilling ? styles.credentialRowFilling : null
      ]}
    >
      <Text style={styles.credentialTitle}>
        {credential.displayName || credential.domain || "Untitled"}
      </Text>
      {username ? <Text style={styles.credentialUsername}>{username}</Text> : null}
    </Pressable>
  )
})

function filterAutofillCredentials(credentials: AutofillCredential[], searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  if (!normalizedSearchQuery) return credentials
  const normalizedSearchDomain = normalizeCredentialDomain(normalizedSearchQuery)

  return credentials.filter(
    (credential) =>
      credential.searchText.includes(normalizedSearchQuery) ||
      credentialMatchesNormalizedDomain(credential.normalizedDomain, normalizedSearchDomain)
  )
}

function credentialMatchesNormalizedDomain(credentialDomain: string, targetDomain: string) {
  if (!credentialDomain || !targetDomain) return false
  if (credentialDomain === targetDomain) return true

  return targetDomain.endsWith(`.${credentialDomain}`)
}

function loadCredentialUsernamesFromIndex(
  credentials: LocalCredential[],
  isActive: () => boolean,
  setUsernameByCredentialKey: (usernames: Record<string, string>) => void
) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      void loadCredentialUsernameIndex(credentials)
        .catch(() => blankUsernamesByCredentialKey(credentials))
        .then((usernames) => {
          if (isActive()) setUsernameByCredentialKey(usernames)
        })
    }, 0)
  })
}

function blankUsernamesByCredentialKey(credentials: LocalCredential[]) {
  return Object.fromEntries(
    credentials.map((credential) => [credentialUsernameCacheKey(credential), ""] as const)
  )
}

function getDefaultSearch(request: AutofillRequest) {
  if (request.webDomain) {
    const domain = normalizeCredentialDomain(request.webDomain) || request.webDomain

    return {
      query: domain,
      targetName: domain
    }
  }

  const appName = request.appName.trim()

  return {
    query: appName,
    targetName: appName
  }
}

function buildAutofillCredential(credential: LocalCredential): AutofillCredential {
  const normalizedDomain = normalizeCredentialDomain(credential.domain)

  return {
    ...credential,
    normalizedDomain,
    searchText: [credential.displayName, credential.domain, normalizedDomain, credential.category]
      .join(" ")
      .toLowerCase()
  }
}

function getRequestDisplayName(request: AutofillRequest) {
  if (request.webDomain) return normalizeCredentialDomain(request.webDomain) || request.webDomain
  if (request.appName.trim()) return request.appName.trim()

  return request.packageName
}

function getAutofillCopy(status: Status, requestingName: string, targetName: string) {
  if (status === "locked") {
    return {
      title: "Unlock the vault",
      body: "Unlock to access the vault."
    }
  }

  return {
    title: "Choose a login",
    body: getAutofillReadyBody(requestingName, targetName)
  }
}

function getAutofillReadyBody(requestingName: string, targetName: string) {
  if (!requestingName) return "Fill a credential from this device."
  if (targetName) return `Fill a credential for ${requestingName}.`

  return `Choose a login for ${requestingName}.`
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
  screen: {
    flex: 1,
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
  credentialCard: {
    flex: 1,
    minHeight: 0
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
    flex: 1,
    minHeight: 0
  },
  credentialListContent: {
    gap: 10
  },
  credentialRow: {
    gap: 4,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  credentialRowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }]
  },
  credentialRowFilling: {
    opacity: 0.62,
    backgroundColor: "#f1dfd3"
  },
  credentialTitle: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "800"
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
