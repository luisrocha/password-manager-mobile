import { ensureMobileCryptoRuntime } from "@/runtime/installMobileCryptoRuntime"
import { env } from "@/config/env"
import { storeMobileDeviceToken } from "@/sync/mobileDeviceToken"
import { assertVaultCryptoCapabilities } from "@/vault/capabilities"
import type { VaultBackup, VaultCrypto } from "@/vault/types"

interface MobileVaultTransferPayload {
  t: "pmv"
  v: 1
  d: {
    p: string
    e: string
    s: {
      p: string
      e: string
      i: string
    }
    k: {
      v: number
      t: number
      m: number
      p: number
      h: number
      s: string
    }
    c: {
      i: string
    }
  }
}

export interface CredentialSecretPayload {
  username: string
  password: string
  notes: string
}

let vaultCrypto: VaultCrypto | null = null
const vaultStateSubscribers = new Set<() => void>()

async function getVaultCrypto() {
  await ensureMobileCryptoRuntime()
  assertVaultCryptoCapabilities()

  if (vaultCrypto === null) {
    // Load OpenPGP-backed vault code only after WebCrypto has been installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMobileVaultCrypto } = require("@/vault/vaultCrypto") as {
      createMobileVaultCrypto: () => VaultCrypto
    }

    vaultCrypto = createMobileVaultCrypto()
  }

  return vaultCrypto
}

export async function hasImportedVaultBackup() {
  return (await getVaultCrypto()).hasStoredVault()
}

export async function isVaultUnlocked() {
  return (await getVaultCrypto()).isVaultUnlocked()
}

export function isLoadedVaultUnlocked() {
  return vaultCrypto?.isVaultUnlocked() ?? false
}

export async function importEncryptedVaultBackup(serializedBackup: string) {
  return (await getVaultCrypto()).importVaultBackup(normalizeVaultBackupImport(serializedBackup))
}

export async function unlockImportedVault(masterPassword: string) {
  const result = await (await getVaultCrypto()).unlockVault(masterPassword)
  notifyVaultStateSubscribers()
  return result
}

export async function decryptCredentialSecretPayload(
  encryptedPayload: string
): Promise<CredentialSecretPayload> {
  const decryptedPayload = await (await getVaultCrypto()).decryptText(encryptedPayload)

  return parseCredentialSecretPayload(decryptedPayload)
}

export async function encryptCredentialSecretPayload(payload: CredentialSecretPayload) {
  return (await getVaultCrypto()).encryptText(JSON.stringify(payload))
}

export async function encryptVaultText(plaintext: string) {
  return (await getVaultCrypto()).encryptText(plaintext)
}

export async function decryptVaultText(ciphertext: string) {
  return (await getVaultCrypto()).decryptText(ciphertext)
}

export async function buildMobileSyncProof(challenge: string) {
  return (await getVaultCrypto()).buildUnlockProof(challenge)
}

export async function importVaultBackupWithPairingCode(
  code: string,
  deviceName?: string,
  options: { replaceExistingVault?: boolean } = {}
) {
  const { deviceToken, serializedBackup } = await redeemVaultPairingCode(code, deviceName)
  const normalizedBackup = normalizeVaultBackupImport(serializedBackup)
  const vaultCryptoAdapter = await getVaultCrypto()
  const shouldKeepExistingVault =
    options.replaceExistingVault === false && (await vaultCryptoAdapter.hasStoredVault())

  if (shouldKeepExistingVault) {
    const existingBackup = normalizeVaultBackupImport(await vaultCryptoAdapter.exportVaultBackup())

    if (existingBackup !== normalizedBackup) {
      throw new Error("pairing_vault_mismatch")
    }

    await storeMobileDeviceToken(deviceToken)
    return JSON.parse(existingBackup) as VaultBackup
  }

  const importedBackup = await vaultCryptoAdapter.importVaultBackup(normalizedBackup)
  await storeMobileDeviceToken(deviceToken)

  return importedBackup
}

export async function lockVault() {
  if (vaultCrypto !== null) {
    vaultCrypto.lockVault()
    notifyVaultStateSubscribers()
  }
}

export function subscribeVaultState(listener: () => void) {
  vaultStateSubscribers.add(listener)

  return () => {
    vaultStateSubscribers.delete(listener)
  }
}

function notifyVaultStateSubscribers() {
  vaultStateSubscribers.forEach((listener) => {
    listener()
  })
}

export function normalizeVaultBackupImport(serializedBackup: string) {
  const parsedBackup = JSON.parse(serializedBackup) as unknown

  if (!isMobileVaultTransferPayload(parsedBackup)) {
    return serializedBackup
  }

  return JSON.stringify(expandMobileVaultTransferPayload(parsedBackup))
}

async function redeemVaultPairingCode(code: string, deviceName?: string) {
  const response = await fetchPairingCode(code, deviceName)
  const body = (await parsePairingResponse(response)) as {
    deviceToken?: unknown
    encryptedVaultBackup?: unknown
    code?: unknown
    error?: unknown
  }

  if (!response.ok) {
    throw new Error(body.code === "pairing_not_found" ? "pairing_not_found" : "pairing_failed")
  }

  if (typeof body.encryptedVaultBackup !== "string" || typeof body.deviceToken !== "string") {
    throw new Error("pairing_invalid_response")
  }

  return {
    deviceToken: body.deviceToken,
    serializedBackup: body.encryptedVaultBackup
  }
}

async function fetchPairingCode(code: string, deviceName?: string) {
  const body: { code: string; deviceName?: string } = { code }
  if (deviceName?.trim()) body.deviceName = deviceName.trim()

  try {
    return await fetch(`${env.apiBaseUrl}/api/mobile/vault_pairings/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error("pairing_network_failed")
  }
}

async function parsePairingResponse(response: Response) {
  return parseJsonResponse(response, "pairing_failed")
}

async function parseJsonResponse(response: Response, errorCode: string) {
  try {
    return await response.json()
  } catch {
    throw new Error(errorCode)
  }
}

function expandMobileVaultTransferPayload(payload: MobileVaultTransferPayload): VaultBackup {
  return {
    version: 1,
    publicKey: payload.d.p,
    encryptedPrivateKey: payload.d.e,
    signing: {
      algorithm: "ECDSA-P256-SHA256",
      publicKeySpki: payload.d.s.p,
      encryptedPrivateKey: payload.d.s.e,
      iv: payload.d.s.i
    },
    kdf: {
      name: "Argon2id",
      version: payload.d.k.v,
      time: payload.d.k.t,
      memoryKiB: payload.d.k.m,
      parallelism: payload.d.k.p,
      hashLength: payload.d.k.h,
      salt: payload.d.k.s
    },
    encryption: {
      name: "AES-GCM",
      iv: payload.d.c.i
    }
  }
}

function isMobileVaultTransferPayload(value: unknown): value is MobileVaultTransferPayload {
  if (!isRecord(value) || value.t !== "pmv" || value.v !== 1 || !isRecord(value.d)) {
    return false
  }

  const { d } = value

  return (
    typeof d.p === "string" &&
    typeof d.e === "string" &&
    isRecord(d.s) &&
    typeof d.s.p === "string" &&
    typeof d.s.e === "string" &&
    typeof d.s.i === "string" &&
    isRecord(d.k) &&
    typeof d.k.v === "number" &&
    typeof d.k.t === "number" &&
    typeof d.k.m === "number" &&
    typeof d.k.p === "number" &&
    typeof d.k.h === "number" &&
    typeof d.k.s === "string" &&
    isRecord(d.c) &&
    typeof d.c.i === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseCredentialSecretPayload(serializedPayload: string): CredentialSecretPayload {
  const payload = JSON.parse(serializedPayload) as unknown
  if (!isRecord(payload)) throw new Error("credential_payload_invalid")

  return {
    username: typeof payload.username === "string" ? payload.username : "",
    password: typeof payload.password === "string" ? payload.password : "",
    notes: typeof payload.notes === "string" ? payload.notes : ""
  }
}
