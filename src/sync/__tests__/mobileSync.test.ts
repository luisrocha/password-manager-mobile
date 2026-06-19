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

    await expect(syncEncryptedCredentials()).resolves.toMatchObject({
      credentials: [
        {
          id: "1",
          displayName: "GitHub",
          domain: "github.com",
          category: "login",
          encryptedSecretPayload: "-----BEGIN PGP MESSAGE-----",
          status: "synced",
          updatedAt: "2026-06-16T10:00:00Z"
        }
      ],
      syncedAt: "2026-06-16T10:01:00Z"
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://vault.localhost/api/mobile/credentials/sync",
      {
        body: undefined,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer raw-token"
        },
        method: "GET"
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

  it("clears and reports revoked mobile device tokens", async () => {
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
    expect(secureValues.has("passwordManager.mobileDeviceToken")).toBe(false)
  })

  it("reports stalled sync requests as network failures", async () => {
    jest.useFakeTimers()
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    globalThis.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch

    const { syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        syncEncryptedCredentials: () => Promise<unknown>
      }

    const syncRequest = expect(syncEncryptedCredentials()).rejects.toThrow(
      "mobile_sync_network_failed"
    )
    await Promise.resolve()
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(8_000)

    await syncRequest
    jest.useRealTimers()
  })

  it("ignores background sync failures because local changes stay queued", async () => {
    mockStorage()

    const { syncEncryptedCredentialsInBackground } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        syncEncryptedCredentialsInBackground: () => Promise<void>
      }

    await expect(syncEncryptedCredentialsInBackground()).resolves.toBeUndefined()
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

  it("queues locally created credentials for later sync", async () => {
    mockStorage()

    const { createLocalCredential, getCachedCredentials, getPendingCredentialOperations } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        createLocalCredential: (credential: {
          category: string
          displayName: string
          domain: string
          encryptedSecretPayload: string
        }) => Promise<{ id: string; status: string }>
        getCachedCredentials: () => Promise<{
          credentials: { displayName: string; status: string }[]
        }>
        getPendingCredentialOperations: () => Promise<{ type: string }[]>
      }

    const credential = await createLocalCredential({
      category: "login",
      displayName: "Local",
      domain: "local.test",
      encryptedSecretPayload: "-----BEGIN PGP MESSAGE-----"
    })

    expect(credential.id).toMatch(/^credential_/)
    expect(credential.status).toBe("pending_create")
    await expect(getCachedCredentials()).resolves.toMatchObject({
      credentials: [{ displayName: "Local", status: "pending_create" }]
    })
    await expect(getPendingCredentialOperations()).resolves.toMatchObject([{ type: "create" }])
  })

  it("queues local updates with the server version they were based on", async () => {
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
            encryptedSecretPayload: "old-payload",
            updatedAt: "2026-06-16T10:00:00Z"
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z"
      })
    )

    const { getCachedCredential, getPendingCredentialOperations, updateLocalCredential } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredential: (id: string) => Promise<{ displayName: string; status: string } | null>
        getPendingCredentialOperations: () => Promise<
          { baseUpdatedAt: string | null; type: string }[]
        >
        updateLocalCredential: (
          id: string,
          credential: {
            category: string
            displayName: string
            domain: string
            encryptedSecretPayload: string
          }
        ) => Promise<unknown>
      }

    await updateLocalCredential("1", {
      category: "login",
      displayName: "GitHub Updated",
      domain: "github.com",
      encryptedSecretPayload: "new-payload"
    })

    await expect(getCachedCredential("1")).resolves.toMatchObject({
      displayName: "GitHub Updated",
      status: "pending_update"
    })
    await expect(getPendingCredentialOperations()).resolves.toMatchObject([
      { baseUpdatedAt: "2026-06-16T10:00:00Z", type: "update" }
    ])
  })

  it("hides locally deleted credentials and queues a delete", async () => {
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
            encryptedSecretPayload: "old-payload",
            updatedAt: "2026-06-16T10:00:00Z"
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z"
      })
    )

    const { deleteLocalCredential, getCachedCredential, getPendingCredentialOperations } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        deleteLocalCredential: (id: string) => Promise<unknown>
        getCachedCredential: (id: string) => Promise<unknown>
        getPendingCredentialOperations: () => Promise<
          { baseUpdatedAt: string | null; serverId: string | null; type: string }[]
        >
      }

    await deleteLocalCredential("1")

    await expect(getCachedCredential("1")).resolves.toBeNull()
    await expect(getPendingCredentialOperations()).resolves.toMatchObject([
      { baseUpdatedAt: "2026-06-16T10:00:00Z", serverId: "1", type: "delete" }
    ])
  })

  it("preserves pending local changes when syncing server credentials", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "1",
            displayName: "GitHub Local",
            domain: "github.com",
            category: "login",
            encryptedSecretPayload: "local-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: "1",
            status: "pending_update",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            deletedAt: null
          },
          {
            id: "credential_local",
            displayName: "Local Only",
            domain: "local.test",
            category: "login",
            encryptedSecretPayload: "local-only-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: null,
            status: "pending_create",
            baseUpdatedAt: null,
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_1",
            type: "update",
            localId: "1",
            serverId: "1",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "GitHub Local",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "local-payload"
            }
          },
          {
            id: "operation_2",
            type: "create",
            localId: "credential_local",
            serverId: null,
            baseUpdatedAt: null,
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "Local Only",
              domain: "local.test",
              category: "login",
              encryptedSecretPayload: "local-only-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            credentials: [
              {
                id: "1",
                displayName: "GitHub Server",
                domain: "github.com",
                category: "login",
                encryptedSecretPayload: "server-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              },
              {
                id: "2",
                displayName: "Docs",
                domain: "docs.test",
                category: "login",
                encryptedSecretPayload: "docs-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:04:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredentials, getPendingCredentialOperations, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredentials: () => Promise<{
          credentials: { displayName: string; id: string; status: string }[]
          syncedAt: string
        }>
        getPendingCredentialOperations: () => Promise<{ type: string }[]>
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await syncEncryptedCredentials()

    await expect(getCachedCredentials()).resolves.toMatchObject({
      credentials: [
        { displayName: "GitHub Local", id: "1", status: "pending_update" },
        { displayName: "Docs", id: "2", status: "synced" },
        { displayName: "Local Only", id: "credential_local", status: "pending_create" }
      ],
      syncedAt: "2026-06-16T10:04:00Z"
    })
    await expect(getPendingCredentialOperations()).resolves.toHaveLength(2)
  })

  it("clears confirmed pending operations after push sync", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "credential_local",
            displayName: "Local Only",
            domain: "local.test",
            category: "login",
            encryptedSecretPayload: "local-only-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: null,
            status: "pending_create",
            baseUpdatedAt: null,
            deletedAt: null
          },
          {
            id: "1",
            displayName: "Delete me",
            domain: "delete.test",
            category: "login",
            encryptedSecretPayload: "delete-payload",
            updatedAt: "2026-06-16T10:00:00Z",
            serverId: "1",
            status: "pending_delete",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            deletedAt: "2026-06-16T10:02:00Z"
          }
        ],
        pendingOperations: [
          {
            id: "operation_create",
            type: "create",
            localId: "credential_local",
            serverId: null,
            baseUpdatedAt: null,
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "Local Only",
              domain: "local.test",
              category: "login",
              encryptedSecretPayload: "local-only-payload"
            }
          },
          {
            id: "operation_delete",
            type: "delete",
            localId: "1",
            serverId: "1",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            createdAt: "2026-06-16T10:02:00Z"
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            operations: [
              {
                id: "operation_create",
                localId: "credential_local",
                serverId: "2",
                status: "confirmed",
                credential: {
                  id: "2",
                  displayName: "Local Only",
                  domain: "local.test",
                  category: "login",
                  encryptedSecretPayload: "local-only-payload",
                  updatedAt: "2026-06-16T10:03:00Z"
                }
              },
              {
                id: "operation_delete",
                localId: "1",
                serverId: "1",
                status: "confirmed"
              }
            ],
            credentials: [
              {
                id: "2",
                displayName: "Local Only",
                domain: "local.test",
                category: "login",
                encryptedSecretPayload: "local-only-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:04:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredentials, getPendingCredentialOperations, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredentials: () => Promise<{
          credentials: { id: string; serverId: string | null; status: string }[]
        }>
        getPendingCredentialOperations: () => Promise<unknown[]>
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await syncEncryptedCredentials()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://vault.localhost/api/mobile/credentials/sync",
      expect.objectContaining({
        body: expect.stringContaining("operation_create"),
        method: "POST"
      })
    )
    await expect(getCachedCredentials()).resolves.toMatchObject({
      credentials: [{ id: "credential_local", serverId: "2", status: "synced" }]
    })
    await expect(getPendingCredentialOperations()).resolves.toEqual([])
  })

  it("notifies repository subscribers after sync reconciliation", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "credential_local",
            displayName: "Local Only",
            domain: "local.test",
            category: "login",
            encryptedSecretPayload: "local-only-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: null,
            status: "pending_create",
            baseUpdatedAt: null,
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_create",
            type: "create",
            localId: "credential_local",
            serverId: null,
            baseUpdatedAt: null,
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "Local Only",
              domain: "local.test",
              category: "login",
              encryptedSecretPayload: "local-only-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            operations: [
              {
                id: "operation_create",
                localId: "credential_local",
                serverId: "2",
                status: "confirmed",
                credential: {
                  id: "2",
                  displayName: "Local Only",
                  domain: "local.test",
                  category: "login",
                  encryptedSecretPayload: "local-only-payload",
                  updatedAt: "2026-06-16T10:03:00Z"
                }
              }
            ],
            credentials: [
              {
                id: "2",
                displayName: "Local Only",
                domain: "local.test",
                category: "login",
                encryptedSecretPayload: "local-only-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:04:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredential, subscribeCredentialRepository, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredential: (id: string) => Promise<{ status: string } | null>
        subscribeCredentialRepository: (listener: () => void) => () => void
        syncEncryptedCredentials: () => Promise<unknown>
      }
    const listener = jest.fn()
    const unsubscribe = subscribeCredentialRepository(listener)

    await syncEncryptedCredentials()
    unsubscribe()

    expect(listener).toHaveBeenCalled()
    await expect(getCachedCredential("credential_local")).resolves.toMatchObject({
      status: "synced"
    })
  })

  it("reuses an in-flight sync request so pending creates are not posted twice", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "credential_local",
            displayName: "Local Only",
            domain: "local.test",
            category: "login",
            encryptedSecretPayload: "local-only-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: null,
            status: "pending_create",
            baseUpdatedAt: null,
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_create",
            type: "create",
            localId: "credential_local",
            serverId: null,
            baseUpdatedAt: null,
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "Local Only",
              domain: "local.test",
              category: "login",
              encryptedSecretPayload: "local-only-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            operations: [
              {
                id: "operation_create",
                localId: "credential_local",
                serverId: "2",
                status: "confirmed",
                credential: {
                  id: "2",
                  displayName: "Local Only",
                  domain: "local.test",
                  category: "login",
                  encryptedSecretPayload: "local-only-payload",
                  updatedAt: "2026-06-16T10:03:00Z"
                }
              }
            ],
            credentials: [
              {
                id: "2",
                displayName: "Local Only",
                domain: "local.test",
                category: "login",
                encryptedSecretPayload: "local-only-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:04:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredentials, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredentials: () => Promise<{
          credentials: { id: string; serverId: string | null; status: string }[]
        }>
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await Promise.all([syncEncryptedCredentials(), syncEncryptedCredentials()])

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    await expect(getCachedCredentials()).resolves.toMatchObject({
      credentials: [{ id: "credential_local", serverId: "2", status: "synced" }]
    })
  })

  it("marks stale pending operations as sync conflicts", async () => {
    mockStorage()
    secureValues.set("passwordManager.mobileDeviceToken", "raw-token")
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "1",
            displayName: "GitHub Local",
            domain: "github.com",
            category: "login",
            encryptedSecretPayload: "local-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: "1",
            status: "pending_update",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_update",
            type: "update",
            localId: "1",
            serverId: "1",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "GitHub Local",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "local-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            operations: [
              {
                id: "operation_update",
                localId: "1",
                serverId: "1",
                status: "conflict",
                credential: {
                  id: "1",
                  displayName: "GitHub Server",
                  domain: "github.com",
                  category: "login",
                  encryptedSecretPayload: "server-payload",
                  updatedAt: "2026-06-16T10:03:00Z"
                }
              }
            ],
            credentials: [
              {
                id: "1",
                displayName: "GitHub Server",
                domain: "github.com",
                category: "login",
                encryptedSecretPayload: "server-payload",
                updatedAt: "2026-06-16T10:03:00Z"
              }
            ],
            syncedAt: "2026-06-16T10:04:00Z"
          })
      })
    ) as unknown as typeof fetch

    const { getCachedCredential, getPendingCredentialOperations, syncEncryptedCredentials } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredential: (id: string) => Promise<{ displayName: string; status: string } | null>
        getPendingCredentialOperations: () => Promise<unknown[]>
        syncEncryptedCredentials: () => Promise<unknown>
      }

    await syncEncryptedCredentials()

    await expect(getCachedCredential("1")).resolves.toMatchObject({
      conflictCredential: {
        displayName: "GitHub Server",
        updatedAt: "2026-06-16T10:03:00Z"
      },
      displayName: "GitHub Local",
      status: "sync_conflict"
    })
    await expect(getPendingCredentialOperations()).resolves.toHaveLength(1)
  })

  it("rebases conflicted local changes before retrying them", async () => {
    mockStorage()
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "1",
            displayName: "GitHub Local",
            domain: "github.com",
            category: "login",
            encryptedSecretPayload: "local-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: "1",
            status: "sync_conflict",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            conflictCredential: {
              id: "1",
              displayName: "GitHub Server",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "server-payload",
              updatedAt: "2026-06-16T10:03:00Z"
            },
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_update",
            type: "update",
            localId: "1",
            serverId: "1",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "GitHub Local",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "local-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )

    const { getCachedCredential, getPendingCredentialOperations, keepLocalCredentialChanges } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        getCachedCredential: (id: string) => Promise<{
          baseUpdatedAt: string | null
          conflictCredential: unknown
          status: string
        } | null>
        getPendingCredentialOperations: () => Promise<{ baseUpdatedAt: string | null }[]>
        keepLocalCredentialChanges: (id: string) => Promise<unknown>
      }

    await keepLocalCredentialChanges("1")

    await expect(getCachedCredential("1")).resolves.toMatchObject({
      baseUpdatedAt: "2026-06-16T10:03:00Z",
      conflictCredential: null,
      status: "pending_update"
    })
    await expect(getPendingCredentialOperations()).resolves.toMatchObject([
      { baseUpdatedAt: "2026-06-16T10:03:00Z" }
    ])
  })

  it("discards conflicted local changes when using the server version", async () => {
    mockStorage()
    asyncValues.set(
      "passwordManager.syncedCredentials",
      JSON.stringify({
        credentials: [
          {
            id: "1",
            displayName: "GitHub Local",
            domain: "github.com",
            category: "login",
            encryptedSecretPayload: "local-payload",
            updatedAt: "2026-06-16T10:02:00Z",
            serverId: "1",
            status: "sync_conflict",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            conflictCredential: {
              id: "1",
              displayName: "GitHub Server",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "server-payload",
              updatedAt: "2026-06-16T10:03:00Z"
            },
            deletedAt: null
          }
        ],
        pendingOperations: [
          {
            id: "operation_update",
            type: "update",
            localId: "1",
            serverId: "1",
            baseUpdatedAt: "2026-06-16T10:00:00Z",
            createdAt: "2026-06-16T10:02:00Z",
            credential: {
              displayName: "GitHub Local",
              domain: "github.com",
              category: "login",
              encryptedSecretPayload: "local-payload"
            }
          }
        ],
        syncedAt: "2026-06-16T10:01:00Z",
        version: 1
      })
    )

    const { applyServerCredentialVersion, getCachedCredential, getPendingCredentialOperations } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/sync/mobileSync") as {
        applyServerCredentialVersion: (id: string) => Promise<unknown>
        getCachedCredential: (
          id: string
        ) => Promise<{ displayName: string; encryptedSecretPayload: string; status: string } | null>
        getPendingCredentialOperations: () => Promise<unknown[]>
      }

    await applyServerCredentialVersion("1")

    await expect(getCachedCredential("1")).resolves.toMatchObject({
      displayName: "GitHub Server",
      encryptedSecretPayload: "server-payload",
      status: "synced"
    })
    await expect(getPendingCredentialOperations()).resolves.toEqual([])
  })
})
