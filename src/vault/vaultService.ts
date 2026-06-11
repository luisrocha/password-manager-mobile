import { assertVaultCryptoCapabilities } from "@/vault/capabilities"
import { createMobileVaultCrypto } from "@/vault/vaultCrypto"

const vaultCrypto = createMobileVaultCrypto()

export async function hasImportedVaultBackup() {
  return vaultCrypto.hasStoredVault()
}

export async function importEncryptedVaultBackup(serializedBackup: string) {
  assertVaultCryptoCapabilities()

  return vaultCrypto.importVaultBackup(serializedBackup)
}

export function lockVault() {
  vaultCrypto.lockVault()
}
