package com.luisrocha.passwordmanager

import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest

class PasswordManagerAutofillService : AutofillService() {
  override fun onFillRequest(
      request: FillRequest,
      cancellationSignal: CancellationSignal,
      callback: FillCallback
  ) {
    // Phase 9 starts with registration only. Matching and fill datasets will be added next.
    callback.onSuccess(null)
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }
}
