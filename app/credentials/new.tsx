import { useLocalSearchParams } from "expo-router"

import { CredentialFormScreen } from "@/credentials/CredentialFormScreen"

export default function NewCredentialScreen() {
  const params = useLocalSearchParams<{ domain?: string; title?: string }>()

  return (
    <CredentialFormScreen
      initialValues={{
        displayName: firstParamValue(params.title),
        domain: firstParamValue(params.domain)
      }}
      mode="create"
    />
  )
}

function firstParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? ""

  return value ?? ""
}
