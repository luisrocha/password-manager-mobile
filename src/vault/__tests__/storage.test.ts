import { createVaultBackupStorage } from "@/vault/storage"

jest.mock("@react-native-async-storage/async-storage", () => {
  const values = new Map<string, string>()

  return {
    getItem: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value)
      return Promise.resolve()
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key)
      return Promise.resolve()
    })
  }
})

describe("createVaultBackupStorage", () => {
  it("stores, reads, and removes values", async () => {
    const storage = createVaultBackupStorage()

    await storage.set("vault", "encrypted-backup")
    await expect(storage.get("vault")).resolves.toBe("encrypted-backup")

    await storage.remove("vault")
    await expect(storage.get("vault")).resolves.toBeNull()
  })
})
