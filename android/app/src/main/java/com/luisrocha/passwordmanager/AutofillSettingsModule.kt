package com.luisrocha.passwordmanager

import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutofillSettingsModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PasswordManagerAutofillSettings"

  @ReactMethod
  fun openAndroidSettings(promise: Promise) {
    val intent = Intent(Settings.ACTION_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    try {
      if (!canOpen(intent)) {
        promise.reject("android_settings_unavailable", "Could not open Android settings.")
        return
      }

      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (_: Exception) {
      promise.reject("android_settings_unavailable", "Could not open Android settings.")
    }
  }

  private fun canOpen(intent: Intent): Boolean {
    return reactContext.packageManager.resolveActivity(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
    ) != null
  }
}
