export interface VaultCryptoCapabilityStatus {
  hasAtob: boolean
  hasBtoa: boolean
  hasCrypto: boolean
  hasCryptoSubtle: boolean
  hasTextDecoder: boolean
  hasTextEncoder: boolean
  missing: string[]
}

export function getVaultCryptoCapabilityStatus(): VaultCryptoCapabilityStatus {
  const globalScope = globalThis as typeof globalThis & {
    atob?: unknown
    btoa?: unknown
    crypto?: {
      subtle?: unknown
    }
    TextDecoder?: unknown
    TextEncoder?: unknown
  }

  const status = {
    hasAtob: typeof globalScope.atob === "function",
    hasBtoa: typeof globalScope.btoa === "function",
    hasCrypto: typeof globalScope.crypto === "object" && globalScope.crypto !== null,
    hasCryptoSubtle:
      typeof globalScope.crypto === "object" &&
      globalScope.crypto !== null &&
      typeof globalScope.crypto.subtle === "object" &&
      globalScope.crypto.subtle !== null,
    hasTextDecoder: typeof globalScope.TextDecoder === "function",
    hasTextEncoder: typeof globalScope.TextEncoder === "function"
  }

  return {
    ...status,
    missing: Object.entries({
      atob: status.hasAtob,
      btoa: status.hasBtoa,
      crypto: status.hasCrypto,
      "crypto.subtle": status.hasCryptoSubtle,
      TextDecoder: status.hasTextDecoder,
      TextEncoder: status.hasTextEncoder
    })
      .filter(([, isAvailable]) => !isAvailable)
      .map(([name]) => name)
  }
}

export function assertVaultCryptoCapabilities() {
  const status = getVaultCryptoCapabilityStatus()

  if (status.missing.length > 0) {
    throw new Error(`vault_crypto_capabilities_missing:${status.missing.join(",")}`)
  }

  return status
}
