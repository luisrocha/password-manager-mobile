import { ensureMobileCryptoRuntime } from "@/runtime/installMobileCryptoRuntime"
import { assertVaultCryptoCapabilities } from "@/vault/capabilities"
import type { VaultCrypto } from "@/vault/types"

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

export async function importEncryptedVaultBackup(serializedBackup: string) {
  return (await getVaultCrypto()).importVaultBackup(serializedBackup)
}

export async function lockVault() {
  if (vaultCrypto !== null) {
    vaultCrypto.lockVault()
  }
}
