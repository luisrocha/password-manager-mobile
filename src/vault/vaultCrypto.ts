import argon2 from "argon2-browser"
import * as openpgp from "openpgp"

import { createVaultCrypto as createSharedVaultCrypto } from "@password-manager/vault-crypto"

import { VAULT_BACKUP_STORAGE_KEY } from "@/vault/constants"
import { createVaultBackupStorage } from "@/vault/storage"
import type { VaultCrypto } from "@/vault/types"

export function createMobileVaultCrypto(): VaultCrypto {
  return createSharedVaultCrypto({
    openpgp,
    argon2,
    storage: createVaultBackupStorage(),
    storageKey: VAULT_BACKUP_STORAGE_KEY
  }) as VaultCrypto
}
