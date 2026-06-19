import { z } from "zod"

declare const __DEV__: boolean | undefined

type EnvSource = Record<string, string | undefined>

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
  source: EnvSource = process.env,
  options: { isDevelopment?: boolean } = {}
) {
  return createEnvSchema(options.isDevelopment ?? isDevelopmentBuild()).parse({
    apiBaseUrl: source.EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL ?? "https://vault.localhost"
  })
}

export const env = loadEnv()
