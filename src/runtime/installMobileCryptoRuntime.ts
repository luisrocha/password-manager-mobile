let installPromise: Promise<boolean> | null = null
let installError: string | null = null

export function installMobileCryptoRuntime() {
  installPromise ??= import("react-native-quick-crypto")
    .then(({ install }) => {
      install()
      installError = null
      return true
    })
    .catch((error: unknown) => {
      installError = error instanceof Error ? error.message : "Unknown crypto runtime error"
      return false
    })

  return installPromise
}

export async function ensureMobileCryptoRuntime() {
  return installMobileCryptoRuntime()
}

export function getMobileCryptoRuntimeInstallError() {
  return installError
}
