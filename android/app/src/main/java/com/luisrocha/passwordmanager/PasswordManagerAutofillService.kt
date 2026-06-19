package com.luisrocha.passwordmanager

import android.os.CancellationSignal
import android.service.autofill.Dataset
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillResponse
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews

class PasswordManagerAutofillService : AutofillService() {
  override fun onFillRequest(
      request: FillRequest,
      cancellationSignal: CancellationSignal,
      callback: FillCallback
  ) {
    val fillableFields = request.fillContexts
        .lastOrNull()
        ?.structure
        ?.windowNodeCount
        ?.let { windowNodeCount ->
          buildList {
            val structure = request.fillContexts.last().structure
            for (index in 0 until windowNodeCount) {
              collectFillableFields(structure.getWindowNodeAt(index).rootViewNode, this)
            }
          }
        }
        .orEmpty()

    if (fillableFields.isEmpty()) {
      callback.onSuccess(null)
      return
    }

    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, "Password Manager debug fill")
    }
    val placeholderDataset = Dataset.Builder(presentation).apply {
      fillableFields.forEach { field ->
        setValue(field, AutofillValue.forText("pm-debug"))
      }
    }.build()

    callback.onSuccess(
        FillResponse.Builder()
            .addDataset(placeholderDataset)
            .build()
    )
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }

  private fun collectFillableFields(
      node: android.app.assist.AssistStructure.ViewNode,
      fields: MutableList<AutofillId>
  ) {
    val autofillId = node.autofillId
    if (autofillId != null && isCredentialField(node)) {
      fields += autofillId
    }

    for (index in 0 until node.childCount) {
      collectFillableFields(node.getChildAt(index), fields)
    }
  }

  private fun isCredentialField(node: android.app.assist.AssistStructure.ViewNode): Boolean {
    val hints = node.autofillHints.orEmpty().map { it.lowercase() }
    if (hints.any { hint -> hint.contains("username") || hint.contains("email") || hint.contains("password") }) {
      return true
    }

    val inputType = node.inputType
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    val textClass = inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT
    val passwordVariation = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
    val emailVariation = variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS

    if (textClass && (passwordVariation || emailVariation)) return true

    val hintText = node.hint?.lowercase().orEmpty()
    if (hintText.contains("username") ||
        hintText.contains("email") ||
        hintText.contains("password")
    ) {
      return true
    }

    val htmlAttributes = node.htmlInfo
        ?.attributes
        .orEmpty()
        .joinToString(" ") { attribute ->
          "${attribute.first} ${attribute.second}"
        }
        .lowercase()
    if (htmlAttributes.contains("username") ||
        htmlAttributes.contains("email") ||
        htmlAttributes.contains("password") ||
        htmlAttributes.contains("current-password") ||
        htmlAttributes.contains("new-password")
    ) {
      return true
    }

    return node.autofillType == View.AUTOFILL_TYPE_TEXT ||
        inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT
  }
}
