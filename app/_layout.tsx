import { router, Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, StyleSheet, View, type AppStateStatus } from "react-native"

import { getAutofillDebugState } from "@/autofill/autofillSettings"
import { AutofillFillScreen } from "@/autofill/AutofillFillScreen"
import { isLoadedVaultUnlocked, lockVault } from "@/vault/vaultService"

const BACKGROUND_AUTO_LOCK_DELAY_MS = 5 * 60 * 1000

export default function RootLayout() {
  const [isNativeAutofillActivity, setIsNativeAutofillActivity] = useState<boolean | null>(null)
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
  const detectNativeAutofillActivity = useCallback(async () => {
    const debugState = await getAutofillDebugState()

    const shouldRenderAutofill =
      debugState?.bridgeActivityPresent === true && debugState.pendingPresent === true
    setIsNativeAutofillActivity(shouldRenderAutofill)
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasActive = appState.current === "active"
      appState.current = nextState

      if (nextState === "active") {
        void detectNativeAutofillActivity()
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
  }, [
    clearAutoLockTimer,
    detectNativeAutofillActivity,
    lockAndReturnHome,
    shouldAutoLockAfterBackground
  ])

  useEffect(() => {
    let isActive = true
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      if (!isActive) return

      void detectNativeAutofillActivity()
      attempts += 1
      if (attempts >= 12) return

      timer = setTimeout(tick, 150)
    }

    tick()

    return () => {
      isActive = false
      if (timer) clearTimeout(timer)
    }
  }, [detectNativeAutofillActivity])

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
      {isNativeAutofillActivity === null ? <View style={styles.autofillOverlay} /> : null}
      {isNativeAutofillActivity ? (
        <View style={styles.autofillOverlay}>
          <AutofillFillScreen onFinished={() => setIsNativeAutofillActivity(false)} />
        </View>
      ) : null}
      <StatusBar style="light" />
    </>
  )
}

const styles = StyleSheet.create({
  autofillOverlay: {
    backgroundColor: "#101820",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }
})
