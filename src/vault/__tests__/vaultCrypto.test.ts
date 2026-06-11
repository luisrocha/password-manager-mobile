import { createVaultCrypto } from "@password-manager/vault-crypto"

import { VAULT_BACKUP_STORAGE_KEY } from "@/vault/constants"
import { createMemoryVaultStorage } from "@/vault/memoryStorage"
import type { VaultBackup } from "@/vault/types"

const syntheticVaultBackup: VaultBackup = {
  version: 1,
  publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----\nsynthetic\n-----END PGP PUBLIC KEY BLOCK-----",
  encryptedPrivateKey: "encrypted-private-key",
  signing: {
    algorithm: "ECDSA-P256-SHA256",
    publicKeySpki: "public-key-spki",
    encryptedPrivateKey: "encrypted-signing-key",
    iv: "signing-iv"
  },
  kdf: {
    name: "Argon2id",
    version: 19,
    time: 2,
    memoryKiB: 19456,
    parallelism: 1,
    hashLength: 32,
    salt: "salt"
  },
  encryption: {
    name: "AES-GCM",
    iv: "private-key-iv"
  }
}

describe("vault crypto integration", () => {
  it("imports and detects a stored encrypted vault backup", async () => {
    const storage = createMemoryVaultStorage()
    const vaultCrypto = createVaultCrypto({
      openpgp: {},
      argon2: {},
      storage,
      storageKey: VAULT_BACKUP_STORAGE_KEY
    })

    await expect(vaultCrypto.hasStoredVault()).resolves.toBe(false)
    await expect(
      vaultCrypto.importVaultBackup(JSON.stringify(syntheticVaultBackup))
    ).resolves.toEqual(syntheticVaultBackup)
    await expect(vaultCrypto.hasStoredVault()).resolves.toBe(true)
  })

  it("rejects unsupported vault backups before storing them", async () => {
    const storage = createMemoryVaultStorage()
    const vaultCrypto = createVaultCrypto({
      openpgp: {},
      argon2: {},
      storage,
      storageKey: VAULT_BACKUP_STORAGE_KEY
    })

    await expect(
      vaultCrypto.importVaultBackup(
        JSON.stringify({
          ...syntheticVaultBackup,
          version: 2
        })
      )
    ).rejects.toThrow("vault_unsupported")
    await expect(vaultCrypto.hasStoredVault()).resolves.toBe(false)
  })
})
