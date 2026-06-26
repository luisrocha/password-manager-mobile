package com.luisrocha.passwordmanager

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.autofill.Dataset
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews

class AutofillSettingsModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PasswordManagerAutofillSettings"

  companion object {
    private const val tag = "PasswordManagerAutofill"
  }

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

  @ReactMethod
  fun getPendingAutofillRequest(promise: Promise) {
    val intent = activeAutofillIntent()
    val ids = intent?.autofillIds().orEmpty()
    val roles = intent?.autofillRoles().orEmpty()

    if (ids.isEmpty() || roles.isEmpty()) {
      promise.resolve(null)
      return
    }

    val map = Arguments.createMap().apply {
      putString(
          "webDomain",
          intent?.getStringExtra(PasswordManagerAutofillService.extraAutofillWebDomain).orEmpty()
      )
      putString(
          "webScheme",
          intent?.getStringExtra(PasswordManagerAutofillService.extraAutofillWebScheme).orEmpty()
      )
      putString(
          "packageName",
          intent?.getStringExtra(PasswordManagerAutofillService.extraAutofillPackageName).orEmpty()
      )
      putString(
          "appName",
          intent?.getStringExtra(PasswordManagerAutofillService.extraAutofillAppName).orEmpty()
      )
      putInt("fieldCount", ids.size)
    }

    promise.resolve(map)
  }

  @ReactMethod
  fun getAutofillDebugState(promise: Promise) {
    promise.resolve(debugState())
  }

  @ReactMethod
  fun consumeShouldLockOnLauncherOpen(promise: Promise) {
    promise.resolve(MainActivity.consumeShouldLockOnNextLauncherOpen())
  }

  @ReactMethod
  fun completeAutofill(username: String, password: String, promise: Promise) {
    val autofillActivity = AutofillActivity.activeActivity()
    val intent = activeAutofillIntent()
    val ids = intent?.autofillIds().orEmpty()
    val roles = intent?.autofillRoles().orEmpty()

    if (autofillActivity == null) {
      Log.e(tag, "completeAutofill failed: autofill activity missing. State: ${debugStateString()}")
      promise.reject(
          "autofill_activity_missing",
          "Autofill activity is not active. State: ${debugStateString()}"
      )
      return
    }

    if (ids.isEmpty()) {
      Log.e(tag, "completeAutofill failed: autofill ids missing. State: ${debugStateString()}")
      promise.reject(
          "autofill_ids_missing",
          "No AutofillId values are available. State: ${debugStateString()}"
      )
      return
    }

    if (roles.isEmpty()) {
      Log.e(tag, "completeAutofill failed: autofill roles missing. State: ${debugStateString()}")
      promise.reject(
          "autofill_roles_missing",
          "No autofill field roles are available. State: ${debugStateString()}"
      )
      return
    }

    val presentation = RemoteViews(reactContext.packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, "Password Manager")
    }
    val dataset = Dataset.Builder(presentation).apply {
      ids.forEachIndexed { index, autofillId ->
        val role = roles.getOrNull(index)
        val value = if (role == PasswordManagerAutofillService.rolePassword) password else username
        setValue(autofillId, AutofillValue.forText(value))
      }
    }.build()
    val result = Intent().apply {
      putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset)
    }

    try {
      promise.resolve(true)
      Handler(Looper.getMainLooper()).post {
        autofillActivity.setResult(Activity.RESULT_OK, result)
        PasswordManagerAutofillService.markCompletingAutofill()
        autofillActivity.finish()
        PasswordManagerAutofillService.clearPendingAutofillIntent()
        reactContext.currentActivity?.moveTaskToBack(true)
      }
    } catch (exception: Exception) {
      Log.e(tag, "completeAutofill failed while setting result. State: ${debugStateString()}", exception)
      promise.reject(
          "autofill_result_failed",
          "Failed to return autofill result. State: ${debugStateString()}",
          exception
      )
    }
  }

  private fun canOpen(intent: Intent): Boolean {
    return reactContext.packageManager.resolveActivity(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
    ) != null
  }

  private fun activeAutofillIntent(): Intent? {
    return PasswordManagerAutofillService.pendingAutofillIntent()
  }

  private fun debugState(): com.facebook.react.bridge.WritableMap {
    val pendingIntent = activeAutofillIntent()
    val currentActivityIntent = reactContext.currentActivity?.intent
    val autofillActivity = AutofillActivity.activeActivity()

    return Arguments.createMap().apply {
      putBoolean("autofillActivityFinishing", autofillActivity?.isFinishing ?: false)
      putBoolean("autofillActivityPresent", autofillActivity != null)
      putBoolean("bridgeActivityFinishing", autofillActivity?.isFinishing ?: false)
      putBoolean("bridgeActivityPresent", autofillActivity != null)
      putString("currentActivityClass", reactContext.currentActivity?.javaClass?.simpleName.orEmpty())
      putBoolean("currentActivityHasAutofillRequest", currentActivityIntent?.hasAutofillRequest() == true)
      putInt("pendingFieldCount", pendingIntent?.autofillIds().orEmpty().size)
      putString(
          "pendingPackageName",
          pendingIntent?.getStringExtra(PasswordManagerAutofillService.extraAutofillPackageName)
              .orEmpty()
      )
      putString(
          "pendingAppName",
          pendingIntent?.getStringExtra(PasswordManagerAutofillService.extraAutofillAppName)
              .orEmpty()
      )
      putBoolean("pendingPresent", pendingIntent != null)
      putInt("pendingRoleCount", pendingIntent?.autofillRoles().orEmpty().size)
      putString(
          "pendingWebDomain",
          pendingIntent?.getStringExtra(PasswordManagerAutofillService.extraAutofillWebDomain)
              .orEmpty()
      )
      putString(
          "pendingWebScheme",
          pendingIntent?.getStringExtra(PasswordManagerAutofillService.extraAutofillWebScheme)
              .orEmpty()
      )
    }
  }

  private fun debugStateString(): String {
    val pendingIntent = activeAutofillIntent()
    val autofillActivity = AutofillActivity.activeActivity()

    return listOf(
        "autofillActivityPresent=${autofillActivity != null}",
        "autofillActivityFinishing=${autofillActivity?.isFinishing ?: false}",
        "currentActivityClass=${reactContext.currentActivity?.javaClass?.simpleName.orEmpty()}",
        "pendingPresent=${pendingIntent != null}",
        "pendingFieldCount=${pendingIntent?.autofillIds().orEmpty().size}",
        "pendingRoleCount=${pendingIntent?.autofillRoles().orEmpty().size}"
    ).joinToString(", ")
  }

  private fun Intent.hasAutofillRequest(): Boolean {
    return autofillIds().isNotEmpty() && autofillRoles().isNotEmpty()
  }

  @Suppress("DEPRECATION")
  private fun Intent.autofillIds(): ArrayList<AutofillId> {
    return getParcelableArrayListExtra(PasswordManagerAutofillService.extraAutofillIds)
        ?: arrayListOf()
  }

  private fun Intent.autofillRoles(): ArrayList<String> {
    return getStringArrayListExtra(PasswordManagerAutofillService.extraAutofillRoles)
        ?: arrayListOf()
  }
}
