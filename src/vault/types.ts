export interface VaultKdfConfig {
  name: "Argon2id"
  version: number
  time: number
  memoryKiB: number
  parallelism: number
  hashLength: number
  salt: string
}

export interface VaultBackup {
  version: 1
  publicKey: string
  encryptedPrivateKey: string
  signing: {
    algorithm: "ECDSA-P256-SHA256"
    publicKeySpki: string
    encryptedPrivateKey: string
    iv: string
  }
  kdf: VaultKdfConfig
  encryption: {
    name: "AES-GCM"
    iv: string
  }
}

export interface VaultCrypto {
  hasStoredVault: () => Promise<boolean>
  isVaultUnlocked: () => boolean
  unlockVault: (masterPassword: string) => Promise<boolean>
  lockVault: () => void
  exportVaultBackup: () => Promise<string>
  importVaultBackup: (serializedBackup: string) => Promise<VaultBackup>
  encryptText: (plaintext: string) => Promise<string>
  decryptText: (ciphertext: string) => Promise<string>
  buildUnlockProof: (challenge: string) => Promise<{
    signature: string
    signingPublicKeySpki: string
  }>
}
