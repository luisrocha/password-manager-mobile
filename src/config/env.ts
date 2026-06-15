import { z } from "zod"

const EnvSchema = z.object({
  apiBaseUrl: z.string().url()
})

export const env = EnvSchema.parse({
  apiBaseUrl: process.env.EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL ?? "https://vault.localhost"
})
