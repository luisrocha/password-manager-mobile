import { useLocalSearchParams } from "expo-router"

import { CredentialFormScreen } from "@/credentials/CredentialFormScreen"

export default function EditCredentialScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()

  return <CredentialFormScreen credentialId={id} mode="edit" />
}
