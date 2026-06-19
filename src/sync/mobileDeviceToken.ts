import { MOBILE_DEVICE_TOKEN_STORAGE_KEY } from "@/vault/constants"
import { createSecureValueStorage } from "@/vault/storage"

const secureStorage = createSecureValueStorage()

export async function storeMobileDeviceToken(token: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) throw new Error("mobile_device_token_missing")

  await secureStorage.set(MOBILE_DEVICE_TOKEN_STORAGE_KEY, normalizedToken)
}

export async function getMobileDeviceToken() {
  return secureStorage.get(MOBILE_DEVICE_TOKEN_STORAGE_KEY)
}

export async function clearMobileDeviceToken() {
  await secureStorage.remove(MOBILE_DEVICE_TOKEN_STORAGE_KEY)
}
