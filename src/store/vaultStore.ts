import { create } from "zustand"

interface VaultState {
  isImported: boolean
  isUnlocked: boolean
  markImported: () => void
  lock: () => void
  unlock: () => void
}

export const useVaultStore = create<VaultState>((set) => ({
  isImported: false,
  isUnlocked: false,
  markImported: () => set({ isImported: true }),
  lock: () => set({ isUnlocked: false }),
  unlock: () => set({ isUnlocked: true })
}))
