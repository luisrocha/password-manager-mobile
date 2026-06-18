import { router, Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useRef } from "react"
import { AppState, type AppStateStatus } from "react-native"

import { isLoadedVaultUnlocked, lockVault } from "@/vault/vaultService"

const BACKGROUND_AUTO_LOCK_DELAY_MS = 5 * 60 * 1000

export default function RootLayout() {
  const appState = useRef<AppStateStatus>(AppState.currentState)
  const backgroundedAt = useRef<number | null>(null)
  const autoLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAutoLockTimer = useCallback(() => {
    if (autoLockTimer.current === null) return

    clearTimeout(autoLockTimer.current)
    autoLockTimer.current = null
  }, [])
  const lockAndReturnHome = useCallback(async () => {
    if (!isLoadedVaultUnlocked()) return

    await lockVault()
    router.replace("/")
  }, [])
  const shouldAutoLockAfterBackground = useCallback((startedAt: number | null) => {
    return (
      startedAt !== null &&
      isLoadedVaultUnlocked() &&
      Date.now() - startedAt >= BACKGROUND_AUTO_LOCK_DELAY_MS
    )
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasActive = appState.current === "active"
      appState.current = nextState

      if (nextState === "active") {
        const shouldLock = shouldAutoLockAfterBackground(backgroundedAt.current)
        backgroundedAt.current = null
        clearAutoLockTimer()
        if (shouldLock) void lockAndReturnHome()
        return
      }

      if (!wasActive || !isLoadedVaultUnlocked()) return

      backgroundedAt.current = Date.now()
      clearAutoLockTimer()
      autoLockTimer.current = setTimeout(() => {
        if (appState.current === "active" || !isLoadedVaultUnlocked()) return

        void lockAndReturnHome()
      }, BACKGROUND_AUTO_LOCK_DELAY_MS)
    })

    return () => {
      clearAutoLockTimer()
      subscription.remove()
    }
  }, [clearAutoLockTimer, lockAndReturnHome, shouldAutoLockAfterBackground])

  return (
    <>
      <Stack
        screenOptions={{
          freezeOnBlur: false,
          headerShown: false,
          contentStyle: {
            backgroundColor: "#101820"
          }
        }}
      />
      <StatusBar style="light" />
    </>
  )
}
