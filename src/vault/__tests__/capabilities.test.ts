import { assertVaultCryptoCapabilities, getVaultCryptoCapabilityStatus } from "@/vault/capabilities"

describe("vault crypto capabilities", () => {
  it("reports missing runtime capabilities", () => {
    const originalAtob = globalThis.atob

    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      value: undefined
    })

    expect(getVaultCryptoCapabilityStatus().missing).toContain("atob")

    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      value: originalAtob
    })
  })

  it("throws a stable error when required capabilities are unavailable", () => {
    const originalCrypto = globalThis.crypto

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined
    })

    expect(() => assertVaultCryptoCapabilities()).toThrow("vault_crypto_capabilities_missing")

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto
    })
  })
})
