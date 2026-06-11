import { z } from "zod"

const EnvSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiToken: z.string().min(1)
})

export const env = EnvSchema.parse({
  apiBaseUrl: process.env.EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL ?? "https://vault.localhost",
  apiToken: process.env.EXPO_PUBLIC_PASSWORD_MANAGER_API_TOKEN ?? "development-token-placeholder"
})
