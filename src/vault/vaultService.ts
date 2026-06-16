import { ensureMobileCryptoRuntime } from "@/runtime/installMobileCryptoRuntime"
import { env } from "@/config/env"
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

let vaultCrypto: VaultCrypto | null = null

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

export async function importEncryptedVaultBackup(serializedBackup: string) {
  return (await getVaultCrypto()).importVaultBackup(normalizeVaultBackupImport(serializedBackup))
}

export async function unlockImportedVault(masterPassword: string) {
  return (await getVaultCrypto()).unlockVault(masterPassword)
}

export async function importVaultBackupWithPairingCode(code: string, deviceName?: string) {
  const serializedBackup = await redeemVaultPairingCode(code, deviceName)

  return importEncryptedVaultBackup(serializedBackup)
}

export async function lockVault() {
  if (vaultCrypto !== null) {
    vaultCrypto.lockVault()
  }
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
    encryptedVaultBackup?: unknown
    code?: unknown
    error?: unknown
  }

  if (!response.ok) {
    throw new Error(body.code === "pairing_not_found" ? "pairing_not_found" : "pairing_failed")
  }

  if (typeof body.encryptedVaultBackup !== "string") {
    throw new Error("pairing_invalid_response")
  }

  return body.encryptedVaultBackup
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
