import { credentialMatchesDomain, normalizeCredentialDomain } from "@/credentials/domainMatching"

describe("domain matching", () => {
  it("normalizes urls and common web subdomains", () => {
    expect(normalizeCredentialDomain("https://www.Example.com/login")).toBe("example.com")
    expect(normalizeCredentialDomain("example.com/account")).toBe("example.com")
  })

  it("matches exact domains and subdomains", () => {
    expect(credentialMatchesDomain({ domain: "example.com" }, "app.example.com")).toBe(true)
    expect(credentialMatchesDomain({ domain: "login.example.com" }, "example.com")).toBe(false)
    expect(credentialMatchesDomain({ domain: "example.com" }, "other.test")).toBe(false)
  })
})
