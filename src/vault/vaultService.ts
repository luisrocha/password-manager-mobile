import { assertVaultCryptoCapabilities } from "@/vault/capabilities"
import type { VaultCrypto } from "@/vault/types"

let vaultCrypto: VaultCrypto | null = null

async function getVaultCrypto() {
  assertVaultCryptoCapabilities()

  if (vaultCrypto === null) {
    const { createMobileVaultCrypto } = await import("@/vault/vaultCrypto")
    vaultCrypto = createMobileVaultCrypto()
  }

  return vaultCrypto
}

export async function hasImportedVaultBackup() {
  return (await getVaultCrypto()).hasStoredVault()
}

export async function importEncryptedVaultBackup(serializedBackup: string) {
  return (await getVaultCrypto()).importVaultBackup(serializedBackup)
}

export async function lockVault() {
  if (vaultCrypto !== null) {
    vaultCrypto.lockVault()
  }
}
