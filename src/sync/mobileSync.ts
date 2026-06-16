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

const credentialsSyncResponseSchema = z.object({
  credentials: z.array(syncedCredentialSchema),
  syncedAt: z.string().min(1)
})

const cachedCredentialsSchema = z.object({
  credentials: z.array(syncedCredentialSchema),
  syncedAt: z.string().min(1)
})

export type SyncedCredential = z.infer<typeof syncedCredentialSchema>

export interface CachedCredentials {
  credentials: SyncedCredential[]
  syncedAt: string
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
  try {
    response = await fetch(`${env.apiBaseUrl}/api/mobile/credentials/sync`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      }
    })
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

  await storeCachedCredentials(parsedResponse.data)

  return parsedResponse.data
}

export async function getCachedCredentials(): Promise<CachedCredentials> {
  const serializedCache = await AsyncStorage.getItem(SYNCED_CREDENTIALS_STORAGE_KEY)
  if (!serializedCache) return emptyCredentialCache()

  try {
    const parsedCache = cachedCredentialsSchema.safeParse(JSON.parse(serializedCache))
    if (parsedCache.success) return parsedCache.data
  } catch {
    // Fall through to an empty cache if the local copy is corrupt.
  }

  return emptyCredentialCache()
}

export async function clearCachedCredentials() {
  await AsyncStorage.removeItem(SYNCED_CREDENTIALS_STORAGE_KEY)
}

async function storeCachedCredentials(cache: CachedCredentials) {
  await AsyncStorage.setItem(SYNCED_CREDENTIALS_STORAGE_KEY, JSON.stringify(cache))
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new Error("mobile_sync_invalid_response")
  }
}

function emptyCredentialCache(): CachedCredentials {
  return { credentials: [], syncedAt: "" }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
