import type * as CredentialUsernameIndex from "@/credentials/credentialUsernameIndex"
import type { LocalCredential } from "@/sync/mobileSync"

const mockValues = new Map<string, string>()
const mockDecryptCredentialSecretPayload = jest.fn()
const mockDecryptVaultText = jest.fn()
const mockEncryptVaultText = jest.fn((plaintext: string) =>
  Promise.resolve(`encrypted:${plaintext}`)
)

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null)),
  multiRemove: jest.fn((keys: string[]) => {
    keys.forEach((key) => mockValues.delete(key))
    return Promise.resolve()
  }),
  removeItem: jest.fn((key: string) => {
    mockValues.delete(key)
    return Promise.resolve()
  }),
  setItem: jest.fn((key: string, value: string) => {
    mockValues.set(key, value)
    return Promise.resolve()
  })
}))

jest.mock("@/vault/vaultService", () => ({
  decryptCredentialSecretPayload: mockDecryptCredentialSecretPayload,
  decryptVaultText: mockDecryptVaultText,
  encryptVaultText: mockEncryptVaultText
}))

const CREDENTIAL_USERNAME_INDEX_STORAGE_KEY = "passwordManager.encryptedCredentialUsernameIndex"

describe("credentialUsernameIndex", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockValues.clear()
  })

  it("reuses a valid encrypted credential username index", async () => {
    const { loadCredentialUsernameIndex } = requireIndex()
    const credentials = [credential({ id: "1", username: "alice" })]
    const cachedIndex = {
      entries: [{ credentialKey: "1:2026-01-01T00:00:00.000Z", username: "alice" }],
      fingerprint: "1:2026-01-01T00:00:00.000Z:encrypted-secret-payload-for-alice:synced",
      version: 1
    }
    mockValues.set(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY, "encrypted-index")
    mockDecryptVaultText.mockResolvedValueOnce(JSON.stringify(cachedIndex))

    await expect(loadCredentialUsernameIndex(credentials)).resolves.toEqual({
      "1:2026-01-01T00:00:00.000Z": "alice"
    })
    expect(mockDecryptCredentialSecretPayload).not.toHaveBeenCalled()
    expect(mockEncryptVaultText).not.toHaveBeenCalled()
  })

  it("rebuilds and stores the encrypted index when the cache is stale", async () => {
    const { loadCredentialUsernameIndex } = requireIndex()
    mockDecryptVaultText.mockResolvedValueOnce(
      JSON.stringify({
        entries: [],
        fingerprint: "old",
        version: 1
      })
    )
    mockDecryptCredentialSecretPayload.mockResolvedValueOnce({
      notes: "",
      password: "secret",
      username: "alice"
    })
    mockValues.set(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY, "encrypted-index")

    await expect(
      loadCredentialUsernameIndex([credential({ id: "1", username: "alice" })])
    ).resolves.toEqual({
      "1:2026-01-01T00:00:00.000Z": "alice"
    })
    expect(mockDecryptCredentialSecretPayload).toHaveBeenCalledWith(
      "encrypted-secret-payload-for-alice"
    )
    expect(mockEncryptVaultText).toHaveBeenCalledWith(expect.stringContaining('"username":"alice"'))
    expect(mockValues.get(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY)).toContain("encrypted:")
  })

  it("clears the encrypted index", async () => {
    const { clearCredentialUsernameIndex } = requireIndex()
    mockValues.set(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY, "encrypted-index")

    await clearCredentialUsernameIndex()

    expect(mockValues.has(CREDENTIAL_USERNAME_INDEX_STORAGE_KEY)).toBe(false)
  })
})

function credential({ id, username }: { id: string; username: string }): LocalCredential {
  return {
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    category: "Personal",
    conflictCredential: null,
    deletedAt: null,
    displayName: "Example",
    domain: "example.com",
    encryptedSecretPayload: `encrypted-secret-payload-for-${username}`,
    id,
    serverId: id,
    status: "synced",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
}

function requireIndex() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/credentials/credentialUsernameIndex") as typeof CredentialUsernameIndex
}
