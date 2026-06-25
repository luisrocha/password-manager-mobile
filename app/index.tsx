import { useFocusEffect, type Href } from "expo-router"
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"

import { env } from "@/config/env"
import { normalizeCredentialDomain } from "@/credentials/domainMatching"
import {
  credentialUsernameCacheKey,
  loadCredentialUsernameIndex
} from "@/credentials/credentialUsernameIndex"
import { guardedPush } from "@/navigation/guardedRouter"
import {
  getCachedCredentials,
  subscribeCredentialRepository,
  syncEncryptedCredentials,
  type LocalCredential
} from "@/sync/mobileSync"
import {
  hasImportedVaultBackup,
  isVaultUnlocked,
  lockVault,
  subscribeVaultState,
  unlockImportedVault
} from "@/vault/vaultService"

type UnlockStatus = "checking" | "idle" | "unlocking" | "unlocked" | "failed"
type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "reconnect" | "failed"
type SearchableCredential = LocalCredential & { normalizedDomain: string; searchText: string }

function getUnlockErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not unlock this vault."

  if (error.message === "vault_missing") return "Set up this device first."

  return "Password is incorrect or failed to unlock vault."
}

export default function HomeScreen() {
  const [hasImportedVault, setHasImportedVault] = useState(false)
  const [masterPassword, setMasterPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [status, setStatus] = useState<UnlockStatus>("checking")
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [credentials, setCredentials] = useState<LocalCredential[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const canUnlock = hasImportedVault && masterPassword.length > 0 && status !== "unlocking"

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      async function refreshLocalState() {
        const [isImported, unlocked, cache] = await Promise.all([
          hasImportedVaultBackup(),
          isVaultUnlocked(),
          getCachedCredentials()
        ])
        if (!isActive) return

        setHasImportedVault(isImported)
        setStatus(unlocked ? "unlocked" : "idle")
        setCredentials(cache.credentials)
        setLastSyncedAt(cache.syncedAt)
        setSyncStatus((currentStatus) => {
          if (currentStatus === "syncing") return currentStatus
          if (currentStatus === "offline" || currentStatus === "reconnect") return currentStatus

          return cache.syncedAt ? "synced" : "idle"
        })
      }

      const unsubscribe = subscribeCredentialRepository(() => {
        refreshLocalState().catch(() => {
          if (!isActive) return

          setHasImportedVault(false)
          setStatus("idle")
        })
      })
      const unsubscribeVaultState = subscribeVaultState(() => {
        refreshLocalState().catch(() => {
          if (!isActive) return

          setHasImportedVault(false)
          setStatus("idle")
        })
      })

      refreshLocalState().catch(() => {
        if (!isActive) return

        setHasImportedVault(false)
        setStatus("idle")
      })

      return () => {
        isActive = false
        unsubscribe()
        unsubscribeVaultState()
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
      await syncCredentials()
    } catch (unlockError) {
      setError(getUnlockErrorMessage(unlockError))
      setStatus("failed")
    }
  }

  async function lock() {
    await lockVault()
    setMasterPassword("")
    setError(null)
    setStatus("idle")
    setSyncStatus("idle")
  }

  async function syncCredentials() {
    setSyncStatus("syncing")

    try {
      const cache = await syncEncryptedCredentials()
      setCredentials(cache.credentials)
      setLastSyncedAt(cache.syncedAt)
      setSyncStatus("synced")
    } catch (syncError) {
      const cache = await getCachedCredentials()
      setCredentials(cache.credentials)
      setLastSyncedAt(cache.syncedAt)

      if (syncError instanceof Error && syncError.message === "mobile_sync_token_missing") {
        setSyncStatus("reconnect")
      } else if (syncError instanceof Error && syncError.message === "mobile_sync_unauthorized") {
        setSyncStatus("reconnect")
      } else if (syncError instanceof Error && syncError.message === "mobile_sync_network_failed") {
        setSyncStatus("offline")
      } else {
        setSyncStatus("failed")
      }
    }
  }

  if (status === "unlocked") {
    return (
      <View style={styles.unlockedScreen}>
        <View style={styles.unlockedHeader}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Password Manager Mobile</Text>
            <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>
          </View>
          <View style={styles.unlockedHeaderActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => guardedPush("/autofill-setup")}
              style={styles.secondaryHeaderButton}
            >
              <Text style={styles.secondaryHeaderButtonText}>Autofill</Text>
            </Pressable>
            <Pressable onPress={lock} style={styles.lockButton}>
              <Text style={styles.lockButtonText}>Lock</Text>
            </Pressable>
          </View>
        </View>

        <CredentialSyncSummary
          credentials={credentials}
          lastSyncedAt={lastSyncedAt}
          onSync={syncCredentials}
          syncStatus={syncStatus}
        />
      </View>
    )
  }

  if (status === "checking") {
    return <LoadingScreen />
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Password Manager Mobile</Text>
        <Text style={styles.title}>Unlock your vault.</Text>
        {!hasImportedVault ? (
          <Text style={styles.body}>This device has not been set up yet.</Text>
        ) : null}
        <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>

        {hasImportedVault ? (
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
                <Text style={styles.passwordToggleText}>{isPasswordVisible ? "Hide" : "Show"}</Text>
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
        ) : (
          <Pressable
            onPress={() => guardedPush({ pathname: "/import-vault", params: { mode: "setup" } })}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Set up device</Text>
          </Pressable>
        )}

        {hasImportedVault ? (
          <Pressable
            onPress={() => guardedPush({ pathname: "/import-vault", params: { mode: "repair" } })}
            style={styles.tertiaryButton}
          >
            <Text style={styles.tertiaryButtonText}>Re-pair device</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => guardedPush("/autofill-setup")}
          style={styles.tertiaryButton}
        >
          <Text style={styles.tertiaryButtonText}>Autofill settings</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

interface CredentialSyncSummaryProps {
  credentials: LocalCredential[]
  lastSyncedAt: string
  onSync: () => Promise<void>
  syncStatus: SyncStatus
}

function CredentialSyncSummary({
  credentials,
  lastSyncedAt,
  onSync,
  syncStatus
}: CredentialSyncSummaryProps) {
  const isOpeningCredentialRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [openingCredentialId, setOpeningCredentialId] = useState<string | null>(null)
  const [usernameByCredentialKey, setUsernameByCredentialKey] = useState<Record<string, string>>({})
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const areCredentialUsernamesReady = useMemo(
    () =>
      credentials.every((credential) =>
        Object.hasOwn(usernameByCredentialKey, credentialUsernameCacheKey(credential))
      ),
    [credentials, usernameByCredentialKey]
  )
  const searchableCredentials = useMemo(
    () => buildSearchableCredentials(credentials),
    [credentials]
  )
  const filteredCredentials = useMemo(
    () => filterCredentials(searchableCredentials, deferredSearchQuery),
    [searchableCredentials, deferredSearchQuery]
  )
  const openCredential = useCallback((credentialId: string) => {
    if (isOpeningCredentialRef.current) return

    isOpeningCredentialRef.current = true
    setOpeningCredentialId(credentialId)
    guardedPush(credentialDetailHref(credentialId))
  }, [])
  const renderCredential = useCallback(
    ({ item }: { item: SearchableCredential }) => (
      <CredentialListItem
        credential={item}
        disabled={openingCredentialId !== null}
        isOpening={openingCredentialId === item.id}
        onOpen={openCredential}
        username={usernameByCredentialKey[credentialUsernameCacheKey(item)] ?? ""}
      />
    ),
    [openCredential, openingCredentialId, usernameByCredentialKey]
  )

  useFocusEffect(
    useCallback(() => {
      isOpeningCredentialRef.current = false
      setOpeningCredentialId(null)
    }, [])
  )

  useEffect(() => {
    let isActive = true

    async function hydrateUsernames() {
      const hydratedUsernames = await loadCredentialUsernameIndex(credentials).catch(() =>
        blankUsernamesByCredentialKey(credentials)
      )
      if (!isActive) return

      setUsernameByCredentialKey(hydratedUsernames)
    }

    void hydrateUsernames()

    return () => {
      isActive = false
    }
  }, [credentials])

  if (credentials.length > 0 && !areCredentialUsernamesReady) {
    return <LoadingScreen />
  }

  return (
    <View style={styles.credentialPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.credentialTitle}>Stored items</Text>
          <Text style={styles.itemCount}>
            {getItemCountText(credentials.length, filteredCredentials.length, searchQuery)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => guardedPush("/credentials/new")}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>Add item</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.syncStatus}>{getSyncStatusMessage(syncStatus, lastSyncedAt)}</Text>
      <SyncRecoveryActions onSync={onSync} syncStatus={syncStatus} />
      {credentials.length > 0 && areCredentialUsernamesReady ? (
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
      ) : null}
      {filteredCredentials.length > 0 ? (
        <FlatList
          data={filteredCredentials}
          extraData={usernameByCredentialKey}
          keyExtractor={(credential) => credential.id}
          keyboardShouldPersistTaps="handled"
          onRefresh={onSync}
          renderItem={renderCredential}
          refreshing={syncStatus === "syncing"}
          showsVerticalScrollIndicator={false}
          style={styles.credentialList}
        />
      ) : credentials.length > 0 ? (
        <Text style={styles.emptyText}>
          No items match this search. Try a title, domain, or category.
        </Text>
      ) : (
        <Text style={styles.emptyText}>
          No stored items on this device yet. Add an item here, or sync from the web app when the
          server is available.
        </Text>
      )}
    </View>
  )
}

function SyncRecoveryActions({
  onSync,
  syncStatus
}: {
  onSync: () => Promise<void>
  syncStatus: SyncStatus
}) {
  if (syncStatus === "reconnect") {
    return (
      <View style={styles.syncActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => guardedPush({ pathname: "/import-vault", params: { mode: "repair" } })}
          style={styles.syncActionButton}
        >
          <Text style={styles.syncActionButtonText}>Re-pair device</Text>
        </Pressable>
      </View>
    )
  }

  if (syncStatus !== "offline" && syncStatus !== "failed") return null

  return (
    <View style={styles.syncActionRow}>
      <Pressable accessibilityRole="button" onPress={onSync} style={styles.syncActionButton}>
        <Text style={styles.syncActionButtonText}>Retry sync</Text>
      </Pressable>
    </View>
  )
}

interface CredentialListItemProps {
  credential: SearchableCredential
  disabled: boolean
  isOpening: boolean
  onOpen: (credentialId: string) => void
  username: string
}

const CredentialListItem = memo(function CredentialListItem({
  credential,
  disabled,
  isOpening,
  onOpen,
  username
}: CredentialListItemProps) {
  const openCredential = useCallback(() => {
    if (disabled) return

    onOpen(credential.id)
  }, [credential.id, disabled, onOpen])

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "#eadcca" }}
      disabled={disabled}
      onPress={openCredential}
      style={({ pressed }) => [
        styles.credentialRow,
        pressed ? styles.credentialRowPressed : null,
        isOpening ? styles.credentialRowOpening : null
      ]}
    >
      <Text style={styles.credentialName}>
        {credential.displayName || credential.domain || "Untitled"}
      </Text>
      {username ? <Text style={styles.credentialUsername}>{username}</Text> : null}
    </Pressable>
  )
})

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color="#d95d39" size="large" />
    </View>
  )
}

function getSyncStatusMessage(syncStatus: SyncStatus, lastSyncedAt: string) {
  if (syncStatus === "syncing") return "Syncing encrypted vault data..."
  if (syncStatus === "offline") return "Server unavailable. Offline mode."
  if (syncStatus === "reconnect") return "Reconnect this device from the web app to sync."
  if (syncStatus === "failed") return "Could not sync right now. Offline mode."
  if (lastSyncedAt) return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`

  return "Sync after unlocking to store items on this device."
}

function buildSearchableCredentials(credentials: LocalCredential[]): SearchableCredential[] {
  return [...credentials].sort(compareCredentials).map((credential) => {
    const normalizedDomain = normalizeCredentialDomain(credential.domain)

    return {
      ...credential,
      normalizedDomain,
      searchText: [credential.displayName, credential.domain, normalizedDomain, credential.category]
        .join(" ")
        .toLowerCase()
    }
  })
}

function filterCredentials(credentials: SearchableCredential[], searchQuery: string) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (!normalizedQuery) return credentials
  const normalizedQueryDomain = normalizeCredentialDomain(normalizedQuery)

  return credentials.filter(
    (credential) =>
      credential.searchText.includes(normalizedQuery) ||
      credentialMatchesNormalizedDomain(credential.normalizedDomain, normalizedQueryDomain)
  )
}

function getItemCountText(totalCount: number, visibleCount: number, searchQuery: string) {
  if (searchQuery.trim()) return `${visibleCount} of ${totalCount} stored`

  return `${totalCount} stored`
}

function credentialDetailHref(id: string): Href {
  return `/credentials/${encodeURIComponent(id)}` as Href
}

function credentialMatchesNormalizedDomain(credentialDomain: string, targetDomain: string) {
  if (!credentialDomain || !targetDomain) return false
  if (credentialDomain === targetDomain) return true

  return targetDomain.endsWith(`.${credentialDomain}`)
}

function blankUsernamesByCredentialKey(credentials: LocalCredential[]) {
  return Object.fromEntries(
    credentials.map((credential) => [credentialUsernameCacheKey(credential), ""] as const)
  )
}

function compareCredentials(first: LocalCredential, second: LocalCredential) {
  const firstLabel = (first.displayName || first.domain || "").toLowerCase()
  const secondLabel = (second.displayName || second.domain || "").toLowerCase()
  const labelComparison = firstLabel.localeCompare(secondLabel)
  if (labelComparison !== 0) return labelComparison

  return first.id.localeCompare(second.id)
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#101820"
  },
  unlockedScreen: {
    flex: 1,
    gap: 16,
    padding: 20,
    paddingTop: 56,
    backgroundColor: "#101820"
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#101820"
  },
  unlockedHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
  },
  unlockedHeaderActions: {
    flexDirection: "row",
    gap: 8
  },
  secondaryHeaderButton: {
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#2f3740"
  },
  secondaryHeaderButtonText: {
    color: "#f4efe6",
    fontSize: 14,
    fontWeight: "900"
  },
  headerCopy: {
    flex: 1,
    gap: 4
  },
  unlockedTitle: {
    color: "#f4efe6",
    fontSize: 36,
    fontWeight: "900",
    lineHeight: 40
  },
  lockButton: {
    minWidth: 76,
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#f4efe6"
  },
  lockButtonText: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "900"
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
    color: "#b9aa94",
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
  credentialPanel: {
    flex: 1,
    minHeight: 0,
    gap: 12,
    padding: 16,
    borderRadius: 28,
    backgroundColor: "#f4efe6"
  },
  syncHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  credentialTitle: {
    color: "#101820",
    fontSize: 22,
    fontWeight: "900"
  },
  itemCount: {
    marginTop: 2,
    color: "#59636c",
    fontSize: 13,
    fontWeight: "700"
  },
  headerActions: {
    flexDirection: "row",
    gap: 8
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#d95d39"
  },
  addButtonText: {
    color: "#fff8ef",
    fontSize: 13,
    fontWeight: "900"
  },
  syncStatus: {
    color: "#59636c",
    fontSize: 13,
    lineHeight: 18
  },
  syncActionRow: {
    flexDirection: "row"
  },
  syncActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7b99f",
    backgroundColor: "#fff8ef"
  },
  syncActionButtonText: {
    color: "#8d4a30",
    fontSize: 13,
    fontWeight: "900"
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
  credentialList: {
    flex: 1,
    minHeight: 0
  },
  credentialRow: {
    gap: 4,
    marginBottom: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff8ef"
  },
  credentialRowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }]
  },
  credentialRowOpening: {
    opacity: 0.62
  },
  credentialName: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "800"
  },
  credentialUsername: {
    color: "#59636c",
    fontSize: 13,
    fontWeight: "700"
  },
  emptyText: {
    color: "#59636c",
    fontSize: 14
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
