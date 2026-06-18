import { generatePassword, normalizeGeneratedPasswordLength } from "@/credentials/passwordGenerator"

describe("generatePassword", () => {
  const originalCrypto = globalThis.crypto

  beforeEach(() => {
    let nextValue = 0

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (values: Uint32Array) => {
          values[0] = nextValue
          nextValue += 1

          return values
        }
      }
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto
    })
  })

  it("generates a password with the same defaults as the web app and extension", () => {
    const password = generatePassword()

    expect(password).toHaveLength(20)
    expect(password).toMatch(/[a-zA-Z]/)
    expect(password).toMatch(/\d/)
    expect(password).not.toMatch(/[!@#$%^&*()\-[\]{};:,.<>?_=+]/)
  })

  it("supports symbol generation when enabled", () => {
    const password = generatePassword({ includeSymbols: true, length: 8 })

    expect(password).toHaveLength(8)
    expect(password).toMatch(/[!@#$%^&*()\-[\]{};:,.<>?_=+]/)
  })

  it("clamps generated password length to the shared range", () => {
    expect(normalizeGeneratedPasswordLength(4)).toBe(8)
    expect(normalizeGeneratedPasswordLength(120)).toBe(100)
    expect(normalizeGeneratedPasswordLength("not a number")).toBe(20)
  })
})
