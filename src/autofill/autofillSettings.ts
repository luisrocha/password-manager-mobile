import { NativeModules, Platform } from "react-native"

interface AutofillSettingsNativeModule {
  openAndroidSettings: () => Promise<boolean>
}

const autofillSettingsModule = NativeModules.PasswordManagerAutofillSettings as
  | AutofillSettingsNativeModule
  | undefined

export async function openAndroidSettings() {
  if (Platform.OS !== "android" || !autofillSettingsModule) return false

  return autofillSettingsModule.openAndroidSettings()
}
