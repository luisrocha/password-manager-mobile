import { env, loadEnv } from "@/config/env"

describe("env", () => {
  it("provides a default API base URL for local development", () => {
    expect(env.apiBaseUrl).toBe("https://vault.localhost")
  })

  it("allows HTTP server URLs in development builds", () => {
    const loadedEnv = loadEnv(
      { EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL: "http://192.168.1.50:3000" },
      { isDevelopment: true }
    )

    expect(loadedEnv.apiBaseUrl).toBe("http://192.168.1.50:3000")
  })

  it("requires HTTPS server URLs outside development builds", () => {
    expect(() =>
      loadEnv(
        { EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL: "http://192.168.1.50:3000" },
        { isDevelopment: false }
      )
    ).toThrow("HTTPS is required outside development builds.")
  })
})
