let installPromise: Promise<boolean> | null = null
let installError: string | null = null

type SubtleCryptoWithImportKey = SubtleCrypto & {
  __passwordManagerAesKwFallbackInstalled?: boolean
}

type ConsoleWithOpenPgpFallbackSuppression = Console & {
  __passwordManagerOpenPgpFallbackSuppressed?: boolean
}

type ImportKeyArguments = Parameters<SubtleCrypto["importKey"]>

function getAlgorithmName(algorithm: ImportKeyArguments[2]) {
  return typeof algorithm === "string" ? algorithm : algorithm.name
}

function createNotSupportedError(message: string) {
  const error = new Error(message)
  error.name = "NotSupportedError"
  return error
}

function suppressExpectedOpenPgpFallbackDebugLog() {
  const consoleWithSuppression = console as ConsoleWithOpenPgpFallbackSuppression

  if (consoleWithSuppression.__passwordManagerOpenPgpFallbackSuppressed) return

  const originalError = console.error.bind(console)

  console.error = (...args: unknown[]) => {
    if (
      args[0] === "[OpenPGP.js debug]" &&
      typeof args[1] === "string" &&
      args[1].includes("AES-KW WebCrypto fallback requested")
    ) {
      return
    }

    originalError(...args)
  }
  consoleWithSuppression.__passwordManagerOpenPgpFallbackSuppressed = true
}

function installAesKeyWrapFallback() {
  const subtle = globalThis.crypto?.subtle as SubtleCryptoWithImportKey | undefined

  if (!subtle || subtle.__passwordManagerAesKwFallbackInstalled) return

  const importKey = subtle.importKey.bind(subtle) as (
    ...args: ImportKeyArguments
  ) => Promise<CryptoKey>

  subtle.importKey = ((...args: ImportKeyArguments) => {
    const [, , algorithm] = args

    if (getAlgorithmName(algorithm).toUpperCase() === "AES-KW") {
      return Promise.reject(createNotSupportedError("AES-KW WebCrypto fallback requested"))
    }

    return importKey(...args)
  }) as SubtleCrypto["importKey"]
  subtle.__passwordManagerAesKwFallbackInstalled = true
}

export function installMobileCryptoRuntime() {
  installPromise ??= Promise.resolve()
    .then(() => {
      // OpenPGP.js v6 expects Web Streams; React Native's runtime may not provide them.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const streams = require("web-streams-polyfill") as {
        ReadableStream: typeof ReadableStream
        TransformStream: typeof TransformStream
        WritableStream: typeof WritableStream
      }
      // Keep native crypto out of app startup while avoiding Metro dynamic-import chunk IDs.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { install } = require("react-native-quick-crypto") as { install: () => void }
      const globalScope = globalThis as typeof globalThis & {
        ReadableStream?: typeof ReadableStream
        TransformStream?: typeof TransformStream
        WritableStream?: typeof WritableStream
      }

      globalScope.ReadableStream = streams.ReadableStream
      globalScope.TransformStream = streams.TransformStream
      globalScope.WritableStream = streams.WritableStream
      install()
      suppressExpectedOpenPgpFallbackDebugLog()
      installAesKeyWrapFallback()
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
