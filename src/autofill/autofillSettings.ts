import { NativeModules, Platform } from "react-native"

interface AutofillSettingsNativeModule {
  completeAutofill: (username: string, password: string) => Promise<boolean>
  getAutofillDebugState: () => Promise<AutofillDebugState>
  getPendingAutofillRequest: () => Promise<AutofillRequest | null>
  openAndroidSettings: () => Promise<boolean>
}

export interface AutofillRequest {
  fieldCount: number
  packageName: string
  webDomain: string
}

export interface AutofillDebugState {
  autofillActivityFinishing: boolean
  autofillActivityPresent: boolean
  bridgeActivityFinishing: boolean
  bridgeActivityPresent: boolean
  currentActivityClass: string
  currentActivityHasAutofillRequest: boolean
  pendingFieldCount: number
  pendingPackageName: string
  pendingPresent: boolean
  pendingRoleCount: number
  pendingWebDomain: string
}

const autofillSettingsModule = NativeModules.PasswordManagerAutofillSettings as
  | AutofillSettingsNativeModule
  | undefined

export async function getPendingAutofillRequest(): Promise<AutofillRequest | null> {
  if (Platform.OS !== "android" || !autofillSettingsModule) return null

  return autofillSettingsModule.getPendingAutofillRequest()
}

export async function getAutofillDebugState(): Promise<AutofillDebugState | null> {
  if (Platform.OS !== "android" || !autofillSettingsModule) return null

  return autofillSettingsModule.getAutofillDebugState()
}

export async function completeAutofill(username: string, password: string) {
  if (Platform.OS !== "android" || !autofillSettingsModule) return false

  return autofillSettingsModule.completeAutofill(username, password)
}

export async function openAndroidSettings() {
  if (Platform.OS !== "android" || !autofillSettingsModule) return false

  return autofillSettingsModule.openAndroidSettings()
}
