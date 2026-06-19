package com.luisrocha.passwordmanager

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.content.pm.PackageManager
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutofillSettingsModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val autofillServiceExtra = "android.provider.extra.AUTOFILL_SERVICE"

  override fun getName(): String = "PasswordManagerAutofillSettings"

  @ReactMethod
  fun openAutofillSettings(promise: Promise) {
    val opened = settingsIntents().any { intent ->
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (!canOpen(intent)) return@any false

        reactContext.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    if (opened) {
      promise.resolve(true)
    } else {
      promise.reject("autofill_settings_unavailable", "Could not open autofill settings.")
    }
  }

  private fun settingsIntents(): List<Intent> {
    val intents = mutableListOf<Intent>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      intents += Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
        putExtra(
            autofillServiceExtra,
            ComponentName(
                    reactContext,
                    PasswordManagerAutofillService::class.java
                )
                .flattenToString()
        )
      }

      val autofillManager = reactContext.getSystemService(AutofillManager::class.java)
      if (autofillManager != null) {
        intents += Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE)
      }

      intents += Intent(Settings.ACTION_PRIVACY_SETTINGS)
    }

    intents += Intent(Settings.ACTION_SECURITY_SETTINGS)
    intents += Intent(Settings.ACTION_SETTINGS)

    return intents
  }

  private fun canOpen(intent: Intent): Boolean {
    return reactContext.packageManager.resolveActivity(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
    ) != null
  }
}
