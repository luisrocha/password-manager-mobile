declare module "@password-manager/vault-crypto" {
  import type { VaultStorageAdapter } from "@/vault/storage"
  import type { VaultCrypto } from "@/vault/types"

  export function createVaultCrypto(options: {
    openpgp: unknown
    argon2: unknown
    storage: VaultStorageAdapter
    storageKey?: string
  }): VaultCrypto

  export function validateVault(vault: unknown): void
}
