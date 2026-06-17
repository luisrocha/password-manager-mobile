import AsyncStorage from "@react-native-async-storage/async-storage"
import { z } from "zod"

import { env } from "@/config/env"
import { MOBILE_DEVICE_TOKEN_STORAGE_KEY, SYNCED_CREDENTIALS_STORAGE_KEY } from "@/vault/constants"
import { createSecureValueStorage } from "@/vault/storage"

const syncedCredentialSchema = z.object({
  id: z.string().min(1),
  displayName: z
    .string()
    .nullable()
    .transform((value) => value ?? ""),
  domain: z.string(),
  category: z.string(),
  encryptedSecretPayload: z.string().min(1),
  updatedAt: z.string().min(1)
})

const localCredentialStatusSchema = z.enum([
  "synced",
  "pending_create",
  "pending_update",
  "pending_delete"
])

const localCredentialSchema = syncedCredentialSchema.extend({
  baseUpdatedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  serverId: z.string().nullable(),
  status: localCredentialStatusSchema
})

const pendingCredentialPayloadSchema = z.object({
  category: z.string(),
  displayName: z.string(),
  domain: z.string(),
  encryptedSecretPayload: z.string().min(1)
})

const pendingCredentialOperationSchema = z.object({
  baseUpdatedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  credential: pendingCredentialPayloadSchema.optional(),
  id: z.string().min(1),
  localId: z.string().min(1),
  serverId: z.string().nullable(),
  type: z.enum(["create", "update", "delete"])
})

const credentialsSyncResponseSchema = z.object({
  operations: z
    .array(
      z.object({
        code: z.string().optional(),
        credential: syncedCredentialSchema.optional(),
        id: z.string().min(1),
        localId: z.string().min(1),
        serverId: z.string().nullable().optional(),
        status: z.enum(["confirmed", "conflict", "failed"])
      })
    )
    .optional(),
  credentials: z.array(syncedCredentialSchema),
  syncedAt: z.string().min(1)
})

const cachedCredentialsSchema = z.object({
  credentials: z.array(syncedCredentialSchema),
  syncedAt: z.string().min(1)
})

const credentialRepositorySchema = z.object({
  credentials: z.array(localCredentialSchema),
  pendingOperations: z.array(pendingCredentialOperationSchema),
  syncedAt: z.string(),
  version: z.literal(1)
})

const SYNC_REQUEST_TIMEOUT_MS = 8_000

export type SyncedCredential = z.infer<typeof syncedCredentialSchema>
export type LocalCredential = z.infer<typeof localCredentialSchema>
export type PendingCredentialOperation = z.infer<typeof pendingCredentialOperationSchema>

export type PendingCredentialPayload = z.infer<typeof pendingCredentialPayloadSchema>

export interface CachedCredentials {
  credentials: LocalCredential[]
  syncedAt: string
}

export interface CredentialRepositorySnapshot extends CachedCredentials {
  pendingOperations: PendingCredentialOperation[]
  version: 1
}

const secureStorage = createSecureValueStorage()

export async function storeMobileDeviceToken(token: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) throw new Error("mobile_device_token_missing")

  await secureStorage.set(MOBILE_DEVICE_TOKEN_STORAGE_KEY, normalizedToken)
}

export async function getMobileDeviceToken() {
  return secureStorage.get(MOBILE_DEVICE_TOKEN_STORAGE_KEY)
}

export async function clearMobileDeviceToken() {
  await secureStorage.remove(MOBILE_DEVICE_TOKEN_STORAGE_KEY)
}

export async function syncEncryptedCredentials() {
  const token = await getMobileDeviceToken()
  if (!token) throw new Error("mobile_sync_token_missing")

  let response: Response
  const currentSnapshot = await getCredentialRepositorySnapshot()
  const requestMethod = currentSnapshot.pendingOperations.length > 0 ? "POST" : "GET"
  const requestBody =
    requestMethod === "POST"
      ? JSON.stringify({ operations: currentSnapshot.pendingOperations })
      : undefined

  try {
    response = await fetchWithTimeout(
      `${env.apiBaseUrl}/api/mobile/credentials/sync`,
      {
        method: requestMethod,
        headers: {
          Accept: "application/json",
          ...(requestBody ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`
        },
        body: requestBody
      },
      SYNC_REQUEST_TIMEOUT_MS
    )
  } catch {
    throw new Error("mobile_sync_network_failed")
  }

  const body = await parseJsonResponse(response)

  if (!response.ok) {
    if (isRecord(body) && body.code === "invalid_mobile_device_token") {
      throw new Error("mobile_sync_unauthorized")
    }

    throw new Error("mobile_sync_failed")
  }

  const parsedResponse = credentialsSyncResponseSchema.safeParse(body)
  if (!parsedResponse.success) throw new Error("mobile_sync_invalid_response")

  const reconciledSnapshot = reconcileConfirmedOperations(
    currentSnapshot,
    parsedResponse.data.operations ?? []
  )
  const nextSnapshot = mergeServerCredentialsIntoSnapshot(
    parsedResponse.data.credentials,
    reconciledSnapshot,
    parsedResponse.data.syncedAt
  )

  await storeCredentialRepositorySnapshot(nextSnapshot)

  return visibleCredentialCache(nextSnapshot)
}

export async function syncEncryptedCredentialsInBackground() {
  try {
    await syncEncryptedCredentials()
  } catch {
    // Local edits are already queued; sync will retry from unlock/pull-to-refresh later.
  }
}

export async function getCachedCredentials(): Promise<CachedCredentials> {
  return visibleCredentialCache(await getCredentialRepositorySnapshot())
}

export async function getCredentialRepositorySnapshot(): Promise<CredentialRepositorySnapshot> {
  const serializedCache = await AsyncStorage.getItem(SYNCED_CREDENTIALS_STORAGE_KEY)
  if (!serializedCache) return emptyCredentialRepositorySnapshot()

  try {
    const parsedJson = JSON.parse(serializedCache)
    const parsedRepository = credentialRepositorySchema.safeParse(parsedJson)
    if (parsedRepository.success) return parsedRepository.data

    const parsedCache = cachedCredentialsSchema.safeParse(parsedJson)
    if (parsedCache.success) return repositorySnapshotFromSyncedCache(parsedCache.data)
  } catch {
    // Fall through to an empty cache if the local copy is corrupt.
  }

  return emptyCredentialRepositorySnapshot()
}

export async function getCachedCredential(id: string) {
  const cache = await getCachedCredentials()

  return cache.credentials.find((credential) => credential.id === id) ?? null
}

export async function getPendingCredentialOperations() {
  const snapshot = await getCredentialRepositorySnapshot()

  return snapshot.pendingOperations
}

export async function createLocalCredential(credential: PendingCredentialPayload) {
  const snapshot = await getCredentialRepositorySnapshot()
  const createdAt = new Date().toISOString()
  const id = createLocalId("credential")
  const nextCredential: LocalCredential = {
    ...credential,
    baseUpdatedAt: null,
    deletedAt: null,
    id,
    serverId: null,
    status: "pending_create",
    updatedAt: createdAt
  }
  const operation: PendingCredentialOperation = {
    baseUpdatedAt: null,
    createdAt,
    credential,
    id: createLocalId("operation"),
    localId: id,
    serverId: null,
    type: "create"
  }

  await storeCredentialRepositorySnapshot({
    ...snapshot,
    credentials: [...snapshot.credentials, nextCredential],
    pendingOperations: [...snapshot.pendingOperations, operation]
  })

  return nextCredential
}

export async function updateLocalCredential(id: string, credential: PendingCredentialPayload) {
  const snapshot = await getCredentialRepositorySnapshot()
  const existingCredential = snapshot.credentials.find(
    (storedCredential) => storedCredential.id === id && storedCredential.status !== "pending_delete"
  )
  if (!existingCredential) throw new Error("local_credential_missing")

  const updatedAt = new Date().toISOString()
  const isPendingCreate = existingCredential.status === "pending_create"
  const baseUpdatedAt = existingCredential.baseUpdatedAt ?? existingCredential.updatedAt
  const nextCredential: LocalCredential = {
    ...existingCredential,
    ...credential,
    baseUpdatedAt: isPendingCreate ? null : baseUpdatedAt,
    deletedAt: null,
    status: isPendingCreate ? "pending_create" : "pending_update",
    updatedAt
  }
  const pendingOperations = replacePendingCredentialOperation(snapshot.pendingOperations, {
    baseUpdatedAt: nextCredential.baseUpdatedAt,
    createdAt: updatedAt,
    credential,
    id: createLocalId("operation"),
    localId: nextCredential.id,
    serverId: nextCredential.serverId,
    type: isPendingCreate ? "create" : "update"
  })

  await storeCredentialRepositorySnapshot({
    ...snapshot,
    credentials: snapshot.credentials.map((storedCredential) =>
      storedCredential.id === id ? nextCredential : storedCredential
    ),
    pendingOperations
  })

  return nextCredential
}

export async function deleteLocalCredential(id: string) {
  const snapshot = await getCredentialRepositorySnapshot()
  const existingCredential = snapshot.credentials.find(
    (storedCredential) => storedCredential.id === id && storedCredential.status !== "pending_delete"
  )
  if (!existingCredential) throw new Error("local_credential_missing")

  if (existingCredential.status === "pending_create") {
    await storeCredentialRepositorySnapshot({
      ...snapshot,
      credentials: snapshot.credentials.filter((storedCredential) => storedCredential.id !== id),
      pendingOperations: snapshot.pendingOperations.filter((operation) => operation.localId !== id)
    })

    return null
  }

  const deletedAt = new Date().toISOString()
  const baseUpdatedAt = existingCredential.baseUpdatedAt ?? existingCredential.updatedAt
  const nextCredential: LocalCredential = {
    ...existingCredential,
    baseUpdatedAt,
    deletedAt,
    status: "pending_delete",
    updatedAt: deletedAt
  }
  const pendingOperations = [
    ...snapshot.pendingOperations.filter((operation) => operation.localId !== nextCredential.id),
    {
      baseUpdatedAt,
      createdAt: deletedAt,
      id: createLocalId("operation"),
      localId: nextCredential.id,
      serverId: nextCredential.serverId,
      type: "delete"
    } satisfies PendingCredentialOperation
  ]

  await storeCredentialRepositorySnapshot({
    ...snapshot,
    credentials: snapshot.credentials.map((storedCredential) =>
      storedCredential.id === id ? nextCredential : storedCredential
    ),
    pendingOperations
  })

  return nextCredential
}

export async function clearCachedCredentials() {
  await AsyncStorage.removeItem(SYNCED_CREDENTIALS_STORAGE_KEY)
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new Error("mobile_sync_invalid_response")
  }
}

async function storeCredentialRepositorySnapshot(snapshot: CredentialRepositorySnapshot) {
  await AsyncStorage.setItem(SYNCED_CREDENTIALS_STORAGE_KEY, JSON.stringify(snapshot))
}

function mergeServerCredentialsIntoSnapshot(
  serverCredentials: SyncedCredential[],
  snapshot: CredentialRepositorySnapshot,
  syncedAt: string
): CredentialRepositorySnapshot {
  const mergedCredentials = new Map<string, LocalCredential>()

  serverCredentials.forEach((credential) => {
    mergedCredentials.set(credential.id, localCredentialFromSyncedCredential(credential))
  })

  snapshot.credentials.forEach((credential) => {
    if (credential.status === "synced") {
      if (credential.serverId && credential.serverId !== credential.id) {
        const serverCredential = serverCredentials.find(
          (syncedCredential) => syncedCredential.id === credential.serverId
        )
        if (serverCredential) {
          mergedCredentials.delete(serverCredential.id)
          mergedCredentials.set(credential.id, {
            ...localCredentialFromSyncedCredential(serverCredential),
            id: credential.id
          })
        }
      }

      return
    }

    mergedCredentials.set(credential.id, credential)
  })

  return {
    credentials: [...mergedCredentials.values()],
    pendingOperations: snapshot.pendingOperations,
    syncedAt,
    version: 1
  }
}

function reconcileConfirmedOperations(
  snapshot: CredentialRepositorySnapshot,
  operationResults: NonNullable<z.infer<typeof credentialsSyncResponseSchema>["operations"]>
): CredentialRepositorySnapshot {
  const confirmedOperations = operationResults.filter(
    (operation) => operation.status === "confirmed"
  )
  if (confirmedOperations.length === 0) return snapshot

  const confirmedOperationIds = new Set(confirmedOperations.map((operation) => operation.id))
  const confirmedCreatesByLocalId = new Map(
    confirmedOperations
      .filter((operation) => operation.credential)
      .map((operation) => [operation.localId, operation])
  )
  const confirmedDeleteLocalIds = new Set(
    confirmedOperations
      .filter((operation) => !operation.credential)
      .map((operation) => operation.localId)
  )

  return {
    ...snapshot,
    credentials: snapshot.credentials
      .filter((credential) => !confirmedDeleteLocalIds.has(credential.id))
      .map((credential) => {
        const confirmedCreate = confirmedCreatesByLocalId.get(credential.id)
        if (!confirmedCreate?.credential) return credential

        return {
          ...localCredentialFromSyncedCredential(confirmedCreate.credential),
          id: credential.id
        }
      }),
    pendingOperations: snapshot.pendingOperations.filter(
      (operation) => !confirmedOperationIds.has(operation.id)
    )
  }
}

function replacePendingCredentialOperation(
  pendingOperations: PendingCredentialOperation[],
  operation: PendingCredentialOperation
) {
  return [
    ...pendingOperations.filter(
      (pendingOperation) =>
        pendingOperation.localId !== operation.localId || pendingOperation.type !== operation.type
    ),
    operation
  ]
}

function visibleCredentialCache(snapshot: CredentialRepositorySnapshot): CachedCredentials {
  return {
    credentials: snapshot.credentials.filter(
      (credential) => credential.status !== "pending_delete"
    ),
    syncedAt: snapshot.syncedAt
  }
}

function repositorySnapshotFromSyncedCache(cache: z.infer<typeof cachedCredentialsSchema>) {
  return {
    credentials: cache.credentials.map(localCredentialFromSyncedCredential),
    pendingOperations: [],
    syncedAt: cache.syncedAt,
    version: 1
  } satisfies CredentialRepositorySnapshot
}

function localCredentialFromSyncedCredential(credential: SyncedCredential): LocalCredential {
  return {
    ...credential,
    baseUpdatedAt: credential.updatedAt,
    deletedAt: null,
    serverId: credential.id,
    status: "synced"
  }
}

function emptyCredentialRepositorySnapshot(): CredentialRepositorySnapshot {
  return { credentials: [], pendingOperations: [], syncedAt: "", version: 1 }
}

function createLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      fetch(url, options),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("request_timeout")), timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
