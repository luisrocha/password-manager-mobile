import { env } from "@/config/env"

describe("env", () => {
  it("provides a default API base URL for local development", () => {
    expect(env.apiBaseUrl).toBe("https://vault.localhost")
  })
})
