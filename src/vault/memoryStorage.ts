import type { VaultStorageAdapter } from "@/vault/storage"

export function createMemoryVaultStorage(): VaultStorageAdapter {
  const values = new Map<string, string>()

  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value)
    },
    remove: async (key) => {
      values.delete(key)
    }
  }
}
