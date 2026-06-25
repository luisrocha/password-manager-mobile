import AsyncStorage from "@react-native-async-storage/async-storage"
import { z } from "zod"

import type { LocalCredential } from "@/sync/mobileSync"
import { CREDENTIAL_USERNAME_INDEX_STORAGE_KEY } from "@/vault/constants"
import {
  decryptCredentialSecretPayload,
  decryptVaultText,
  encryptVaultText
} from "@/vault/vaultService"

const credentialUsernameIndexEntrySchema = z.object({
  credentialKey: z.string().min(1),
  username: z.string()
})

const credentialUsernameIndexSchema = z.object({
  entries: z.array(credentialUsernameIndexEntrySchema),
  fingerprint: z.string(),
  version: z.literal(1)
})

type CredentialUsernameIndex = z.infer<typeof credentialUsernameIndexSchema>

export async function loadCredentialUsernameIndex(credentials: LocalCredential[]) {
  const fingerprint = credentialUsernameIndexFingerprint(credentials)
  const cachedIndex = await readStoredCredentialUsernameIndex()

  if (cachedIndex?.fingerprint === fingerprint) {
    return usernamesByCredentialKey(cachedIndex)
  }

  const rebuiltIndex = await buildCredentialUsernameIndex(credentials, fingerprint)
  await storeCredentialUsernameIndex(rebuiltIndex)

  return usernamesByCredentialKey(rebuiltIndex)
}

export async function clearCredentialUsernameIndex() {
  await AsyncStorage.removeItem(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY)
}

async function readStoredCredentialUsernameIndex() {
  const encryptedIndex = await AsyncStorage.getItem(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY)
  if (!encryptedIndex) return null

  try {
    const decryptedIndex = await decryptVaultText(encryptedIndex)
    const parsedIndex = credentialUsernameIndexSchema.safeParse(JSON.parse(decryptedIndex))

    return parsedIndex.success ? parsedIndex.data : null
  } catch {
    return null
  }
}

async function buildCredentialUsernameIndex(
  credentials: LocalCredential[],
  fingerprint: string
): Promise<CredentialUsernameIndex> {
  const entries = await Promise.all(
    credentials.map(async (credential) => {
      const username = await decryptCredentialSecretPayload(credential.encryptedSecretPayload)
        .then((secret) => secret.username)
        .catch(() => "")

      return {
        credentialKey: credentialUsernameCacheKey(credential),
        username
      }
    })
  )

  return {
    entries,
    fingerprint,
    version: 1
  }
}

async function storeCredentialUsernameIndex(index: CredentialUsernameIndex) {
  const encryptedIndex = await encryptVaultText(JSON.stringify(index))

  await AsyncStorage.setItem(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY, encryptedIndex)
}

function usernamesByCredentialKey(index: CredentialUsernameIndex) {
  return Object.fromEntries(
    index.entries.map((entry) => [entry.credentialKey, entry.username] as const)
  )
}

function credentialUsernameIndexFingerprint(credentials: LocalCredential[]) {
  return [...credentials]
    .map((credential) => [
      credentialUsernameCacheKey(credential),
      credential.encryptedSecretPayload,
      credential.status
    ])
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map((parts) => parts.join(":"))
    .join("|")
}

export function credentialUsernameCacheKey(credential: LocalCredential) {
  return `${credential.id}:${credential.updatedAt}`
}
