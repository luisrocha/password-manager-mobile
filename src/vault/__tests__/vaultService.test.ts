describe("vaultService", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
  })

  const expandedVaultBackup = {
    version: 1,
    publicKey: "public-key",
    encryptedPrivateKey: "encrypted-private-key",
    signing: {
      algorithm: "ECDSA-P256-SHA256",
      publicKeySpki: "signing-public-key",
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

  const mobileVaultTransfer = {
    t: "pmv",
    v: 1,
    d: {
      p: "public-key",
      e: "encrypted-private-key",
      s: {
        p: "signing-public-key",
        e: "encrypted-signing-key",
        i: "signing-iv"
      },
      k: {
        v: 19,
        t: 2,
        m: 19456,
        p: 1,
        h: 32,
        s: "salt"
      },
      c: {
        i: "private-key-iv"
      }
    }
  }

  it("imports encrypted vault backups through the mobile crypto adapter", async () => {
    const importVaultBackup = jest.fn(() => Promise.resolve({ version: 1 }))
    const hasStoredVault = jest.fn(() => Promise.resolve(true))

    jest.doMock("@/runtime/installMobileCryptoRuntime", () => ({
      ensureMobileCryptoRuntime: jest.fn(() => Promise.resolve(true))
    }))
    jest.doMock("@/vault/capabilities", () => ({
      assertVaultCryptoCapabilities: jest.fn()
    }))
    jest.doMock("@/vault/vaultCrypto", () => ({
      createMobileVaultCrypto: jest.fn(() => ({
        hasStoredVault,
        importVaultBackup,
        lockVault: jest.fn()
      }))
    }))

    const { hasImportedVaultBackup, importEncryptedVaultBackup } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        hasImportedVaultBackup: () => Promise<boolean>
        importEncryptedVaultBackup: (serializedBackup: string) => Promise<unknown>
      }

    await expect(importEncryptedVaultBackup('{"version":1}')).resolves.toEqual({ version: 1 })
    await expect(hasImportedVaultBackup()).resolves.toBe(true)
    expect(importVaultBackup).toHaveBeenCalledWith('{"version":1}')
  })

  it("expands compact mobile vault transfer payloads before import", async () => {
    const importVaultBackup = jest.fn(() => Promise.resolve(expandedVaultBackup))

    jest.doMock("@/runtime/installMobileCryptoRuntime", () => ({
      ensureMobileCryptoRuntime: jest.fn(() => Promise.resolve(true))
    }))
    jest.doMock("@/vault/capabilities", () => ({
      assertVaultCryptoCapabilities: jest.fn()
    }))
    jest.doMock("@/vault/vaultCrypto", () => ({
      createMobileVaultCrypto: jest.fn(() => ({
        hasStoredVault: jest.fn(),
        importVaultBackup,
        lockVault: jest.fn()
      }))
    }))

    const { importEncryptedVaultBackup, normalizeVaultBackupImport } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        importEncryptedVaultBackup: (serializedBackup: string) => Promise<unknown>
        normalizeVaultBackupImport: (serializedBackup: string) => string
      }
    const serializedTransfer = JSON.stringify(mobileVaultTransfer)

    expect(JSON.parse(normalizeVaultBackupImport(serializedTransfer))).toEqual(expandedVaultBackup)
    await expect(importEncryptedVaultBackup(serializedTransfer)).resolves.toEqual(
      expandedVaultBackup
    )
    expect(importVaultBackup).toHaveBeenCalledWith(JSON.stringify(expandedVaultBackup))
  })

  it("imports encrypted vault backups from pairing codes", async () => {
    const importVaultBackup = jest.fn(() => Promise.resolve(expandedVaultBackup))
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ encryptedVaultBackup: JSON.stringify(mobileVaultTransfer) })
      })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    jest.doMock("@/config/env", () => ({
      env: {
        apiBaseUrl: "https://vault.localhost"
      }
    }))
    jest.doMock("@/runtime/installMobileCryptoRuntime", () => ({
      ensureMobileCryptoRuntime: jest.fn(() => Promise.resolve(true))
    }))
    jest.doMock("@/vault/capabilities", () => ({
      assertVaultCryptoCapabilities: jest.fn()
    }))
    jest.doMock("@/vault/vaultCrypto", () => ({
      createMobileVaultCrypto: jest.fn(() => ({
        hasStoredVault: jest.fn(),
        importVaultBackup,
        lockVault: jest.fn()
      }))
    }))

    const { importVaultBackupWithPairingCode } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        importVaultBackupWithPairingCode: (code: string) => Promise<unknown>
      }

    await expect(importVaultBackupWithPairingCode("ABCD-EFGH")).resolves.toEqual(
      expandedVaultBackup
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://vault.localhost/api/mobile/vault_pairings/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABCD-EFGH" })
      }
    )
    expect(importVaultBackup).toHaveBeenCalledWith(JSON.stringify(expandedVaultBackup))
  })

  it("reports missing pairing codes", async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ code: "pairing_not_found" })
      })
    ) as unknown as typeof fetch

    jest.doMock("@/config/env", () => ({
      env: {
        apiBaseUrl: "https://vault.localhost"
      }
    }))

    const { importVaultBackupWithPairingCode } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        importVaultBackupWithPairingCode: (code: string) => Promise<unknown>
      }

    await expect(importVaultBackupWithPairingCode("ABCD-EFGH")).rejects.toThrow("pairing_not_found")
  })

  it("reports pairing network failures", async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch

    jest.doMock("@/config/env", () => ({
      env: {
        apiBaseUrl: "https://vault.localhost"
      }
    }))

    const { importVaultBackupWithPairingCode } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        importVaultBackupWithPairingCode: (code: string) => Promise<unknown>
      }

    await expect(importVaultBackupWithPairingCode("ABCD-EFGH")).rejects.toThrow(
      "pairing_network_failed"
    )
  })

  it("unlocks imported vaults locally", async () => {
    const unlockVault = jest.fn(() => Promise.resolve(true))

    jest.doMock("@/config/env", () => ({
      env: {
        apiBaseUrl: "https://vault.localhost"
      }
    }))
    jest.doMock("@/runtime/installMobileCryptoRuntime", () => ({
      ensureMobileCryptoRuntime: jest.fn(() => Promise.resolve(true))
    }))
    jest.doMock("@/vault/capabilities", () => ({
      assertVaultCryptoCapabilities: jest.fn()
    }))
    jest.doMock("@/vault/vaultCrypto", () => ({
      createMobileVaultCrypto: jest.fn(() => ({
        hasStoredVault: jest.fn(),
        importVaultBackup: jest.fn(),
        isVaultUnlocked: jest.fn(() => false),
        unlockVault,
        lockVault: jest.fn()
      }))
    }))

    const { unlockImportedVault } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/vault/vaultService") as {
        unlockImportedVault: (masterPassword: string) => Promise<unknown>
      }

    await expect(unlockImportedVault("master-password")).resolves.toBe(true)
    expect(unlockVault).toHaveBeenCalledWith("master-password")
  })
})
