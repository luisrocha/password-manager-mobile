import { createMemoryVaultStorage } from "@/vault/memoryStorage"

describe("createMemoryVaultStorage", () => {
  it("stores values without native dependencies", async () => {
    const storage = createMemoryVaultStorage()

    await storage.set("key", "value")
    await expect(storage.get("key")).resolves.toBe("value")

    await storage.remove("key")
    await expect(storage.get("key")).resolves.toBeNull()
  })
})
