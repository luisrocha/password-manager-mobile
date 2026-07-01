import { z } from "zod"

declare const __DEV__: boolean | undefined

type EnvSource = Record<string, string | undefined>
const DEFAULT_DEVELOPMENT_API_BASE_URL = "https://vault.localhost"
const defaultEnvSource: EnvSource = {
  EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL:
    process.env.EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__
}

function createEnvSchema(isDevelopment: boolean) {
  return z
    .object({
      apiBaseUrl: z.string().url()
    })
    .superRefine((value, context) => {
      if (isDevelopment) return

      if (new URL(value.apiBaseUrl).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["apiBaseUrl"],
          message: "HTTPS is required outside development builds."
        })
      }
    })
}

export function loadEnv(
  source: EnvSource = defaultEnvSource,
  options: { isDevelopment?: boolean } = {}
) {
  const isDevelopment = options.isDevelopment ?? isDevelopmentBuild()

  return createEnvSchema(isDevelopment).parse({
    apiBaseUrl:
      source.EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL ??
      (isDevelopment ? DEFAULT_DEVELOPMENT_API_BASE_URL : undefined)
  })
}

export const env = loadEnv()
