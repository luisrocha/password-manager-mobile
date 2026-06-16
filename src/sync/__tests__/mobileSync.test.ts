describe("mobileSync", () => {
  const asyncValues = new Map<string, string>()
  const secureValues = new Map<string, string>()

  beforeEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
    asyncValues.clear()
    secureValues.clear()
  })

  function mockStorage() {
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      getItem: jest.fn((key: string) => Promise.resolve(asyncValues.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        asyncValues.set(key, value)
        return Promise.resolve()
      }),
      removeItem: jest.fn((key: string) => {
        asyncValues.delete(key)
        return Promise.resolve()
      })
    }))

    jest.doMock("expo-secure-store", () => ({
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
      deleteItemAsync: jest.fn((key: string) => {
        secureValues.delete(key)
        return Promise.resolve()
      }),
      getItemAsync: jest.fn((key: string) => Promise.resolve(secureValues.get(key) ?? null)),
      setItemAsync: jest.fn((key: string, value: string) => {
        secureValues.set(key, value)
        return Promise.resolve()
      })
    }))

    jest.doMock("@/config/env", () => ({
      env: {
        apiBaseUrl: "https://vault.localhost"
      }
    }))
  }

  it("stores the mobile device token in secure storage", async () => {
    mockStorage()

    const { getMobileDeviceToken, storeMobileDeviceToken } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getMobileDeviceToken: () => Promise<string | null>
        storeMobileDeviceToken: (token: string) => Promise<void>
      }

    await storeMobileDeviceToken(" raw-token ")

    await expect(getMobileDeviceToken()).resolves.toBe("raw-token")
  })

  it("syncs encrypted credentials and stores them in the local cache", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            credentials: [
              {
                id: "1",
                displayName: "GitHub",
                domain: "github.com",
                category: "login",
                encryptedSecretPayload: "-----BEGIN PGP MESSAGE-----",
                updatedAt: "2026-06-16T10:00:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:01:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredentials, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredentials: () => Promise<{
          credentials: { id: string; displayName: string }[]
          syncedAt: string
        }>
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await expect(syncEncryptedCredentials()).resolves.toEqual({
      credentials: [
        {
          id: "1",
          displayName: "GitHub",
          domain: "github.com",
          category: "login",
          encryptedSecretPayload: "-----BEGIN PGP MESSAGE-----",
          updatedAt: "2026-06-16T10:00:00Z"
        }
      ],
      syncedAt: "2026-06-16T10:01:00Z"
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://vault.localhost/api/mobile/credentials/sync",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer raw-token"
        }
      }
    )
    await expect(getCachedCredentials()).resolves.toMatchObject({
      credentials: [{ id: "1", displayName: "GitHub" }],
      syncedAt: "2026-06-16T10:01:00Z"
    })
  })

  it("reports missing mobile device tokens", async () => {
    mockStorage()

    const { syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await expect(syncEncryptedCredentials()).rejects.toThrow("mobile_sync_token_missing")
  })

  it("reports revoked mobile device tokens", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ code: "invalid_mobile_device_token" })
      })
    ) as unknown as typeof fetch

    const { syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await expect(syncEncryptedCredentials()).rejects.toThrow("mobile_sync_unauthorized")
  })

  it("falls back to an empty cache when local cached credentials are invalid", async () => {
    mockStorage()
    asyncValues.set("passwordManager.syncedCredentials", "{")

    const { getCachedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredentials: () => Promise<{ credentials: unknown[]; syncedAt: string }>
      }

    await expect(getCachedCredentials()).resolves.toEqual({ credentials: [], syncedAt: "" })
  })

  it("finds cached credentials by id", async () => {
    mockStorage()
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "1",
            displayName: "GitHub",
            domain: "github.com",
            category: "login",
            encryptedSecretPayload: "-----BEGIN PGP MESSAGE-----",
            updatedAt: "2026-06-16T10:00:00Z"
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z"
      })
    )

    const { getCachedCredential } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredential: (id: string) => Promise<{ id: string } | null>
      }

    await expect(getCachedCredential("1")).resolves.toMatchObject({ id: "1" })
    await expect(getCachedCredential("missing")).resolves.toBeNull()
  })
})
