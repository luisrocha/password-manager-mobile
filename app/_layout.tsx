import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"

import { AppProviders } from "@/providers/AppProviders"

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#101820"
          }
        }}
      />
      <StatusBar style="light" />
    </AppProviders>
  )
}
