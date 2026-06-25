import * as Clipboard from "expo-clipboard"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"

import {
  deleteLocalCredential,
  getCachedCredential,
  keepLocalCredentialChanges,
  applyServerCredentialVersion,
  subscribeCredentialRepository,
  syncEncryptedCredentialsInBackground,
  type LocalCredential
} from "@/sync/mobileSync"
import { guardedPush } from "@/navigation/guardedRouter"
import {
  decryptCredentialSecretPayload,
  isVaultUnlocked,
  lockVault,
  type CredentialSecretPayload
} from "@/vault/vaultService"

type DetailStatus = "loading" | "ready" | "locked" | "missing" | "failed"
const CLIPBOARD_CLEAR_DELAY_MS = 30_000

export default function CredentialDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [credential, setCredential] = useState<LocalCredential | null>(null)
  const [secretPayload, setSecretPayload] = useState<CredentialSecretPayload | null>(null)
  const [status, setStatus] = useState<DetailStatus>("loading")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [areNotesVisible, setAreNotesVisible] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      async function loadCredential({ showLoading = false } = {}) {
        if (showLoading) setStatus("loading")

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
          setCredential(null)
          setSecretPayload(null)
          setStatus("missing")
          return
        }

        setCredential(cachedCredential)
        setSecretPayload(null)
        setStatus("ready")
        decryptCredentialSecretPayload(cachedCredential.encryptedSecretPayload)
          .then((payload) => {
            if (isActive) setSecretPayload(payload)
          })
          .catch(() => {
            if (isActive) setStatus("locked")
          })
      }

      const unsubscribe = subscribeCredentialRepository(() => {
        loadCredential().catch(() => {
          if (isActive) setStatus("failed")
        })
      })

      loadCredential({ showLoading: true }).catch(() => {
        if (isActive) setStatus("failed")
      })

      return () => {
        isActive = false
        unsubscribe()
        setSecretPayload(null)
        setIsPasswordVisible(false)
        setAreNotesVisible(false)
        setCopyStatus(null)
        setIsResolvingConflict(false)
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
    } catch {
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
    setTimeout(() => clearClipboardIfUnchanged(payload[field]), CLIPBOARD_CLEAR_DELAY_MS)
  }

  async function clearClipboardIfUnchanged(value: string) {
    const currentValue = await Clipboard.getStringAsync()
    if (currentValue === value) await Clipboard.setStringAsync("")
  }

  async function lock() {
    await lockVault()
    setSecretPayload(null)
    setIsPasswordVisible(false)
    setAreNotesVisible(false)
    router.replace("/")
  }

  async function deleteCredential() {
    if (!credential || isDeleting) return

    setIsDeleting(true)

    try {
      await deleteLocalCredential(credential.id)
      void syncEncryptedCredentialsInBackground()
      setSecretPayload(null)
      router.replace("/")
    } catch {
      setStatus("failed")
      setIsDeleting(false)
    }
  }

  async function keepLocalChanges() {
    if (!credential || isResolvingConflict) return

    setIsResolvingConflict(true)

    try {
      await keepLocalCredentialChanges(credential.id)
      void syncEncryptedCredentialsInBackground()
    } catch {
      setStatus("failed")
    } finally {
      setIsResolvingConflict(false)
    }
  }

  async function useServerVersion() {
    if (!credential || isResolvingConflict) return

    setIsResolvingConflict(true)

    try {
      await applyServerCredentialVersion(credential.id)
    } catch {
      setStatus("failed")
    } finally {
      setIsResolvingConflict(false)
    }
  }

  const isConflict = credential?.status === "sync_conflict"

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.headerRow}>
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
          <Pressable accessibilityRole="button" onPress={lock} style={styles.lockButton}>
            <Text style={styles.lockButtonText}>Lock</Text>
          </Pressable>
        ) : null}
      </View>

      {credential ? (
        <View style={styles.card}>
          {!isConflict ? (
            <>
              <Text style={styles.title}>
                {credential.displayName || credential.domain || "Untitled"}
              </Text>
              <Text style={styles.meta}>
                {[credential.domain, credential.category].filter(Boolean).join(" · ")}
              </Text>
            </>
          ) : null}
          <CredentialSyncNotice status={credential.status} />
          {isConflict ? (
            <ConflictResolutionCards
              credential={credential}
              isResolving={isResolvingConflict}
              localSecretPayload={secretPayload}
              onKeepLocal={keepLocalChanges}
              onUseServer={useServerVersion}
            />
          ) : (
            <View style={styles.cardActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  guardedPush(`/credentials/${encodeURIComponent(credential.id)}/edit`)
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isDeleting}
                onPress={deleteCredential}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>{isDeleting ? "Deleting..." : "Delete"}</Text>
              </Pressable>
            </View>
          )}
          {copyStatus ? <Text style={styles.copyStatus}>{copyStatus}</Text> : null}

          {!isConflict ? (
            <>
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
            </>
          ) : null}
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

interface ConflictResolutionCardsProps {
  credential: LocalCredential
  isResolving: boolean
  localSecretPayload: CredentialSecretPayload | null
  onKeepLocal: () => Promise<void>
  onUseServer: () => Promise<void>
}

function ConflictResolutionCards({
  credential,
  isResolving,
  localSecretPayload,
  onKeepLocal,
  onUseServer
}: ConflictResolutionCardsProps) {
  const { width } = useWindowDimensions()
  const [serverSecretState, setServerSecretState] = useState<{
    encryptedPayload: string | null
    payload: CredentialSecretPayload | null
    status: "ready" | "failed"
  }>({ encryptedPayload: null, payload: null, status: "failed" })
  const serverCredential = credential.conflictCredential
  const serverEncryptedPayload = serverCredential?.encryptedSecretPayload ?? null
  const isCurrentServerSecret = serverSecretState.encryptedPayload === serverEncryptedPayload
  const serverSecretPayload = isCurrentServerSecret ? serverSecretState.payload : null
  const serverSecretStatus = isCurrentServerSecret ? serverSecretState.status : "loading"
  const [activeVersionIndex, setActiveVersionIndex] = useState(0)
  const [switchDirection, setSwitchDirection] = useState(1)
  const [switchProgress] = useState(() => new Animated.Value(1))
  const cardWidth = Math.max(width - 92, 252)
  const switchCards = (direction: number) => {
    setSwitchDirection(direction)
    switchProgress.setValue(0)
    setActiveVersionIndex((currentIndex) => (currentIndex === 0 ? 1 : 0))
    Animated.spring(switchProgress, {
      damping: 15,
      mass: 0.7,
      stiffness: 180,
      toValue: 1,
      useNativeDriver: true
    }).start()
  }
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dx) > 24 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderRelease: (_, gestureState) => {
      if (Math.abs(gestureState.dx) < 42) return

      switchCards(gestureState.dx < 0 ? 1 : -1)
    }
  })
  const activeCardAnimation = {
    opacity: switchProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.88, 1]
    }),
    transform: [
      {
        translateX: switchProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [switchDirection * Math.min(cardWidth * 0.58, 180), 0]
        })
      }
    ]
  }

  useEffect(() => {
    let isActive = true

    if (!serverEncryptedPayload) return undefined

    decryptCredentialSecretPayload(serverEncryptedPayload)
      .then((payload) => {
        if (!isActive) return
        setServerSecretState({ encryptedPayload: serverEncryptedPayload, payload, status: "ready" })
      })
      .catch(() => {
        if (!isActive) return
        setServerSecretState({
          encryptedPayload: serverEncryptedPayload,
          payload: null,
          status: "failed"
        })
      })

    return () => {
      isActive = false
    }
  }, [serverEncryptedPayload])

  if (!serverCredential) return null

  const versionCards: ConflictVersionCardData[] = [
    {
      actionLabel: isResolving ? "Resolving..." : "Keep local changes",
      label: "On this phone",
      onPress: onKeepLocal,
      secretPayload: localSecretPayload,
      secretStatus: localSecretPayload ? ("ready" as const) : ("loading" as const),
      version: {
        category: credential.category,
        displayName: credential.displayName,
        domain: credential.domain,
        updatedAt: credential.updatedAt
      }
    },
    {
      actionLabel: isResolving ? "Resolving..." : "Use server changes",
      label: "On server",
      onPress: onUseServer,
      secretPayload: serverSecretPayload,
      secretStatus: serverSecretStatus,
      version: serverCredential
    }
  ]
  const activeVersion = versionCards[activeVersionIndex]
  const inactiveVersion = versionCards[activeVersionIndex === 0 ? 1 : 0]

  return (
    <View style={styles.conflictCards}>
      <Text style={styles.conflictHint}>Swipe left or right to compare versions.</Text>
      <View style={styles.conflictStack} {...panResponder.panHandlers}>
        <View pointerEvents="none" style={styles.conflictCardBehind}>
          <ConflictVersionCard
            actionLabel={inactiveVersion.actionLabel}
            disabled={isResolving}
            label={inactiveVersion.label}
            onPress={inactiveVersion.onPress}
            secretPayload={inactiveVersion.secretPayload}
            secretStatus={inactiveVersion.secretStatus}
            style={{ width: cardWidth }}
            version={inactiveVersion.version}
          />
        </View>
        <Animated.View style={activeCardAnimation}>
          <ConflictVersionCard
            actionLabel={activeVersion.actionLabel}
            disabled={isResolving}
            label={activeVersion.label}
            onPress={activeVersion.onPress}
            secretPayload={activeVersion.secretPayload}
            secretStatus={activeVersion.secretStatus}
            style={{ width: cardWidth }}
            version={activeVersion.version}
          />
        </Animated.View>
      </View>
    </View>
  )
}

interface ConflictVersionCardProps {
  actionLabel: string
  disabled: boolean
  label: string
  onPress: () => Promise<void>
  secretPayload: CredentialSecretPayload | null
  secretStatus: "loading" | "ready" | "failed"
  style?: object
  version: Pick<LocalCredential, "category" | "displayName" | "domain" | "updatedAt">
}

type ConflictVersionCardData = Omit<ConflictVersionCardProps, "disabled" | "style">

function ConflictVersionCard({
  actionLabel,
  disabled,
  label,
  onPress,
  secretPayload,
  secretStatus,
  style,
  version
}: ConflictVersionCardProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [areNotesVisible, setAreNotesVisible] = useState(false)

  return (
    <View style={[styles.conflictCard, style]}>
      <Text style={styles.conflictCardLabel}>{label}</Text>
      <Text style={styles.conflictCardTitle}>
        {version.displayName || version.domain || "Untitled"}
      </Text>
      <Text style={styles.conflictCardMeta}>
        {[version.domain, version.category].filter(Boolean).join(" · ")}
      </Text>
      <Text style={styles.conflictCardTime}>Last updated {formatUpdatedAt(version.updatedAt)}</Text>
      <View style={styles.conflictSecrets}>
        <VersionSecretValue
          label="Username"
          value={secretPayload?.username}
          status={secretStatus}
        />
        <VersionSecretValue
          isVisible={isPasswordVisible}
          label="Password"
          onToggle={() => setIsPasswordVisible((visible) => !visible)}
          value={secretPayload?.password}
          status={secretStatus}
        />
        <VersionSecretValue
          isVisible={areNotesVisible}
          label="Notes"
          onToggle={() => setAreNotesVisible((visible) => !visible)}
          value={secretPayload?.notes}
          status={secretStatus}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={[styles.conflictCardButton, disabled ? styles.disabledButton : null]}
      >
        <Text style={styles.conflictCardButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

function VersionSecretValue({
  isVisible = true,
  label,
  onToggle,
  status,
  value
}: {
  isVisible?: boolean
  label: string
  onToggle?: () => void
  status: "loading" | "ready" | "failed"
  value?: string
}) {
  return (
    <View style={styles.versionSecret}>
      <View style={styles.versionSecretHeader}>
        <Text style={styles.versionSecretLabel}>{label}</Text>
        {onToggle ? (
          <Pressable
            accessibilityRole="button"
            onPress={onToggle}
            style={styles.versionRevealButton}
          >
            <Text style={styles.versionRevealButtonText}>{isVisible ? "Hide" : "Reveal"}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.versionSecretValue, label === "Notes" ? styles.multilineValue : null]}>
        {isVisible ? secretDisplayValue(status, value) : "Hidden"}
      </Text>
    </View>
  )
}

function secretDisplayValue(status: "loading" | "ready" | "failed", value?: string) {
  if (status === "loading") return "Decrypting..."
  if (status === "failed") return "Could not decrypt"

  return value || "-"
}

function CredentialSyncNotice({ status }: { status: LocalCredential["status"] }) {
  const message = getCredentialSyncMessage(status)
  if (!message) return null

  return (
    <Text
      style={[
        styles.syncNotice,
        status === "sync_conflict" ? styles.conflictNotice : null,
        status === "pending_delete" ? styles.deletePendingNotice : null
      ]}
    >
      {message}
    </Text>
  )
}

function getCredentialSyncMessage(status: LocalCredential["status"]) {
  if (status === "pending_create") return "Pending sync"
  if (status === "pending_update") return "Pending sync"
  if (status === "pending_delete") return "Pending delete"
  if (status === "sync_conflict")
    return "This item changed on the server before your edit synced. Review it before retrying."

  return null
}

function formatUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return "unknown"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
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
  if (status === "missing")
    return "This item is not available on this device. Sync again when the server is reachable."
  if (status === "failed") return "Return to the vault and try opening this item again."

  return "Loading the local item."
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
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
  lockButton: {
    minWidth: 76,
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#6d5f45"
  },
  lockButtonText: {
    color: "#f4efe6",
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
  syncNotice: {
    padding: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#efe1c8",
    color: "#6d5f45",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  conflictNotice: {
    backgroundColor: "#f4d0c7",
    color: "#a33b2a"
  },
  deletePendingNotice: {
    backgroundColor: "#f4d0c7",
    color: "#a33b2a"
  },
  conflictCards: {
    gap: 12
  },
  conflictHint: {
    color: "#6d5f45",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  conflictStack: {
    alignItems: "center",
    paddingRight: 12,
    paddingBottom: 18
  },
  conflictCardBehind: {
    position: "absolute",
    top: 14,
    right: 0,
    opacity: 0.72,
    transform: [{ rotate: "2deg" }]
  },
  conflictCard: {
    gap: 12,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e1b3a7",
    backgroundColor: "#fff8ef",
    shadowColor: "#101820",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5
  },
  conflictCardLabel: {
    color: "#a33b2a",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  conflictCardTitle: {
    color: "#101820",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24
  },
  conflictCardMeta: {
    color: "#59636c",
    fontSize: 14,
    lineHeight: 20
  },
  conflictCardTime: {
    color: "#6d5f45",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  conflictCardButton: {
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#b6402d"
  },
  conflictCardButtonText: {
    color: "#fff8ef",
    fontSize: 14,
    fontWeight: "900"
  },
  conflictSecrets: {
    gap: 9
  },
  versionSecret: {
    gap: 5,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#f4efe6"
  },
  versionSecretHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  versionSecretLabel: {
    color: "#6d5f45",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  versionSecretValue: {
    color: "#101820",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  versionRevealButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#101820"
  },
  versionRevealButtonText: {
    color: "#fff8ef",
    fontSize: 12,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.55
  },
  cardActions: {
    flexDirection: "row",
    gap: 10
  },
  secondaryButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#101820"
  },
  secondaryButtonText: {
    color: "#fff8ef",
    fontSize: 14,
    fontWeight: "900"
  },
  deleteButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#a33b2a"
  },
  deleteButtonText: {
    color: "#a33b2a",
    fontSize: 14,
    fontWeight: "900"
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
