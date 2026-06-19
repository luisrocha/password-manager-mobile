import { NativeModules, Platform } from "react-native"

interface AutofillSettingsNativeModule {
  openAutofillSettings: () => Promise<boolean>
}

const autofillSettingsModule = NativeModules.PasswordManagerAutofillSettings as
  | AutofillSettingsNativeModule
  | undefined

export async function openAutofillSettings() {
  if (Platform.OS !== "android" || !autofillSettingsModule) return false

  return autofillSettingsModule.openAutofillSettings()
}
