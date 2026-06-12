import { createVaultCrypto as createSharedVaultCrypto } from "@password-manager/vault-crypto"

import { VAULT_BACKUP_STORAGE_KEY } from "@/vault/constants"
import { mobileArgon2 } from "@/vault/mobileArgon2"
import { mobileOpenPgp } from "@/vault/mobileOpenPgp"
import { createVaultBackupStorage } from "@/vault/storage"
import type { VaultCrypto } from "@/vault/types"

export function createMobileVaultCrypto(): VaultCrypto {
  return createSharedVaultCrypto({
    openpgp: mobileOpenPgp,
    argon2: mobileArgon2,
    storage: createVaultBackupStorage(),
    storageKey: VAULT_BACKUP_STORAGE_KEY
  }) as VaultCrypto
}
