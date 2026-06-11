import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"

export interface VaultStorageAdapter {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  remove: (key: string) => Promise<void>
}

export function createVaultBackupStorage(): VaultStorageAdapter {
  return {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
    remove: (key) => AsyncStorage.removeItem(key)
  }
}

export function createSecureValueStorage(): VaultStorageAdapter {
  return {
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      }),
    remove: (key) => SecureStore.deleteItemAsync(key)
  }
}
