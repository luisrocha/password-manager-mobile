import { Link, router, useFocusEffect, type Href } from "expo-router"
import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

import { env } from "@/config/env"
import {
  getCachedCredentials,
  syncEncryptedCredentials,
  type SyncedCredential
} from "@/sync/mobileSync"
import {
  hasImportedVaultBackup,
  isVaultUnlocked,
  lockVault,
  unlockImportedVault
} from "@/vault/vaultService"

type UnlockStatus = "idle" | "unlocking" | "unlocked" | "failed"
type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "reconnect" | "failed"
type SearchableCredential = SyncedCredential & { searchText: string }

function getUnlockErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Could not unlock this vault."

  if (error.message === "vault_missing") return "Import your vault key first."

  return "Password is incorrect or failed to unlock vault."
}

export default function HomeScreen() {
  const [hasImportedVault, setHasImportedVault] = useState(false)
  const [masterPassword, setMasterPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [status, setStatus] = useState<UnlockStatus>("idle")
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [credentials, setCredentials] = useState<SyncedCredential[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const canUnlock = hasImportedVault && masterPassword.length > 0 && status !== "unlocking"

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      Promise.all([hasImportedVaultBackup(), isVaultUnlocked(), getCachedCredentials()])
        .then(([isImported, unlocked, cache]) => {
          if (!isActive) return

          setHasImportedVault(isImported)
          setStatus(unlocked ? "unlocked" : "idle")
          setCredentials(cache.credentials)
          setLastSyncedAt(cache.syncedAt)
          setSyncStatus(cache.syncedAt ? "synced" : "idle")
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
        console.error(syncError)
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
            <Text style={styles.unlockedTitle}>Vault</Text>
            <Text style={styles.meta}>Server: {env.apiBaseUrl}</Text>
          </View>
          <Pressable onPress={lock} style={styles.lockButton}>
            <Text style={styles.lockButtonText}>Lock</Text>
          </Pressable>
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

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
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
    </ScrollView>
  )
}

interface CredentialSyncSummaryProps {
  credentials: SyncedCredential[]
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
  const [searchQuery, setSearchQuery] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const searchableCredentials = useMemo(
    () => buildSearchableCredentials(credentials),
    [credentials]
  )
  const filteredCredentials = useMemo(
    () => filterCredentials(searchableCredentials, deferredSearchQuery),
    [searchableCredentials, deferredSearchQuery]
  )
  const renderCredential = useCallback(
    ({ item }: { item: SearchableCredential }) => <CredentialListItem credential={item} />,
    []
  )

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
            onPress={() => router.push("/credentials/new")}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>Add item</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={syncStatus === "syncing"}
            onPress={onSync}
            style={styles.syncButton}
          >
            <Text style={styles.syncButtonText}>
              {syncStatus === "syncing" ? "Syncing..." : "Sync"}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.syncStatus}>{getSyncStatusMessage(syncStatus, lastSyncedAt)}</Text>
      {credentials.length > 0 ? (
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
      ) : null}
      {filteredCredentials.length > 0 ? (
        <FlatList
          data={filteredCredentials}
          keyExtractor={(credential) => credential.id}
          keyboardShouldPersistTaps="handled"
          onRefresh={onSync}
          renderItem={renderCredential}
          refreshing={syncStatus === "syncing"}
          showsVerticalScrollIndicator={false}
          style={styles.credentialList}
        />
      ) : credentials.length > 0 ? (
        <Text style={styles.emptyText}>No items match this search.</Text>
      ) : (
        <Text style={styles.emptyText}>No synced items on this device yet.</Text>
      )}
    </View>
  )
}

interface CredentialListItemProps {
  credential: SyncedCredential
}

function CredentialListItem({ credential }: CredentialListItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(credentialDetailHref(credential.id))}
      style={styles.credentialRow}
    >
      <Text style={styles.credentialName}>
        {credential.displayName || credential.domain || "Untitled"}
      </Text>
      <Text style={styles.credentialMeta}>
        {[credential.domain, credential.category].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
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

function buildSearchableCredentials(credentials: SyncedCredential[]): SearchableCredential[] {
  return [...credentials].sort(compareCredentials).map((credential) => ({
    ...credential,
    searchText: [credential.displayName, credential.domain, credential.category]
      .join(" ")
      .toLowerCase()
  }))
}

function filterCredentials(credentials: SearchableCredential[], searchQuery: string) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (!normalizedQuery) return credentials

  return credentials.filter((credential) => credential.searchText.includes(normalizedQuery))
}

function getItemCountText(totalCount: number, visibleCount: number, searchQuery: string) {
  if (searchQuery.trim()) return `${visibleCount} of ${totalCount} stored`

  return `${totalCount} stored`
}

function credentialDetailHref(id: string): Href {
  return `/credentials/${encodeURIComponent(id)}` as Href
}

function compareCredentials(first: SyncedCredential, second: SyncedCredential) {
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
  unlockedHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
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
  syncButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#101820"
  },
  syncButtonText: {
    color: "#fff8ef",
    fontSize: 13,
    fontWeight: "800"
  },
  syncStatus: {
    color: "#59636c",
    fontSize: 13,
    lineHeight: 18
  },
  searchInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#fff8ef",
    color: "#101820",
    fontSize: 16,
    fontWeight: "700"
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
  credentialName: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "800"
  },
  credentialMeta: {
    color: "#59636c",
    fontSize: 13
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
