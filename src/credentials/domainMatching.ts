import type { LocalCredential } from "@/sync/mobileSync"

export function normalizeCredentialDomain(value: string) {
  const trimmedValue = value.trim().toLowerCase()
  if (!trimmedValue) return ""

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`

  try {
    const host = new URL(withProtocol).hostname.replace(/\.$/, "")

    return stripCommonSubdomain(host)
  } catch {
    return stripCommonSubdomain(trimmedValue.split("/")[0]?.replace(/\.$/, "") ?? "")
  }
}

export function credentialMatchesDomain(
  credential: Pick<LocalCredential, "domain">,
  value: string
) {
  const credentialDomain = normalizeCredentialDomain(credential.domain)
  const targetDomain = normalizeCredentialDomain(value)

  if (!credentialDomain || !targetDomain) return false
  if (credentialDomain === targetDomain) return true

  return targetDomain.endsWith(`.${credentialDomain}`)
}

function stripCommonSubdomain(host: string) {
  return host.startsWith("www.") ? host.slice(4) : host
}
