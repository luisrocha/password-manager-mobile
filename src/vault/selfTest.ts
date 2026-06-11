import argon2 from "argon2-browser/dist/argon2-bundled.min"
import * as openpgp from "openpgp/dist/openpgp.min.mjs"

import { createVaultCrypto as createSharedVaultCrypto } from "@password-manager/vault-crypto"

import { assertVaultCryptoCapabilities } from "@/vault/capabilities"
import { createMemoryVaultStorage } from "@/vault/memoryStorage"
import type { VaultCrypto } from "@/vault/types"

export interface VaultCryptoSelfTestResult {
  canStoreBackup: boolean
  canUnlock: boolean
  canEncryptAndDecrypt: boolean
  canBuildUnlockProof: boolean
}

export async function runVaultCryptoSelfTest(): Promise<VaultCryptoSelfTestResult> {
  assertVaultCryptoCapabilities()

  const vaultCrypto = createSharedVaultCrypto({
    openpgp,
    argon2,
    storage: createMemoryVaultStorage(),
    storageKey: "passwordManager.selfTestVault"
  }) as VaultCrypto & {
    generateVault: (masterPassword: string) => Promise<unknown>
  }
  const masterPassword = "diagnostic master password"
  const plaintext = "diagnostic secret"

  await vaultCrypto.generateVault(masterPassword)
  const canStoreBackup = await vaultCrypto.hasStoredVault()

  vaultCrypto.lockVault()
  const canUnlock = await vaultCrypto.unlockVault(masterPassword)

  const encryptedText = await vaultCrypto.encryptText(plaintext)
  const decryptedText = await vaultCrypto.decryptText(encryptedText)
  const unlockProof = await vaultCrypto.buildUnlockProof("diagnostic challenge")

  return {
    canStoreBackup,
    canUnlock,
    canEncryptAndDecrypt: decryptedText === plaintext,
    canBuildUnlockProof:
      unlockProof.signature.length > 0 && unlockProof.signingPublicKeySpki.length > 0
  }
}
