package com.luisrocha.passwordmanager

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

class AutofillActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (!rememberAutofillRequest(intent)) {
      Log.w(tag, "Finishing because auth intent did not contain autofill ids.")
      finish()
      return
    }

    currentActivity = this
    startActivity(Intent(this, MainActivity::class.java))
  }

  override fun onDestroy() {
    if (currentActivity === this) {
      currentActivity = null
    }

    if (isFinishing && !PasswordManagerAutofillService.isCompletingAutofill()) {
      PasswordManagerAutofillService.clearPendingAutofillIntent()
    }

    super.onDestroy()
  }

  private fun rememberAutofillRequest(intent: Intent): Boolean {
    if (!intent.hasExtra(PasswordManagerAutofillService.extraAutofillIds)) return false

    PasswordManagerAutofillService.rememberPendingAutofillIntent(intent)
    return true
  }

  companion object {
    private const val tag = "PasswordManagerAutofill"
    private var currentActivity: AutofillActivity? = null

    fun activeActivity(): AutofillActivity? {
      return currentActivity
    }
  }
}
