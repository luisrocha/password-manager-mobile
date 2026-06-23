package com.luisrocha.passwordmanager

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.Dataset
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillResponse
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.text.InputType
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import java.util.ArrayList

class PasswordManagerAutofillService : AutofillService() {
  companion object {
    private const val tag = "PasswordManagerAutofill"
    const val extraAutofillIds = "com.luisrocha.passwordmanager.AUTOFILL_IDS"
    const val extraAutofillRoles = "com.luisrocha.passwordmanager.AUTOFILL_ROLES"
    const val extraAutofillWebDomain = "com.luisrocha.passwordmanager.AUTOFILL_WEB_DOMAIN"
    const val extraAutofillPackageName = "com.luisrocha.passwordmanager.AUTOFILL_PACKAGE_NAME"
    const val autofillRouteUri = "password-manager:///autofill-fill"
    const val rolePassword = "password"
    const val roleUsername = "username"

    @Volatile private var pendingAutofillIntent: Intent? = null
    @Volatile private var completingAutofill = false

    fun rememberPendingAutofillIntent(intent: Intent) {
      completingAutofill = false
      pendingAutofillIntent = Intent(intent)
    }

    fun pendingAutofillIntent(): Intent? {
      return pendingAutofillIntent?.let(::Intent)
    }

    fun clearPendingAutofillIntent() {
      pendingAutofillIntent = null
      completingAutofill = false
    }

    fun markCompletingAutofill() {
      completingAutofill = true
    }

    fun isCompletingAutofill(): Boolean {
      return completingAutofill
    }
  }

  override fun onFillRequest(
      request: FillRequest,
      cancellationSignal: CancellationSignal,
      callback: FillCallback
  ) {
    val latestStructure = request.fillContexts.lastOrNull()?.structure
    val requestingPackageName = latestStructure?.activityComponent?.packageName.orEmpty()
    if (requestingPackageName == packageName) {
      callback.onSuccess(null)
      return
    }

    val candidates = latestStructure
        ?.windowNodeCount
        ?.let { windowNodeCount ->
          buildList {
            for (index in 0 until windowNodeCount) {
              collectFillableFields(latestStructure.getWindowNodeAt(index).rootViewNode, this)
            }
          }
        }
        .orEmpty()
    val hasPasswordField = candidates.any { field -> field.role == rolePassword }
    val fields = candidates.filter { field -> field.isStrongSignal || hasPasswordField }

    if (fields.isEmpty()) {
      callback.onSuccess(null)
      return
    }

    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, "Password Manager")
    }
    val authenticationIntent = Intent(this, AutofillActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(autofillRouteUri)
      addCategory(Intent.CATEGORY_DEFAULT)
      addCategory(Intent.CATEGORY_BROWSABLE)
      putParcelableArrayListExtra(
          extraAutofillIds,
          ArrayList(fields.map { field -> field.id })
      )
      putStringArrayListExtra(
          extraAutofillRoles,
          ArrayList(fields.map { field -> field.role })
      )
      putExtra(extraAutofillWebDomain, "")
      putExtra(extraAutofillPackageName, requestingPackageName)
    }
    val authentication = PendingIntent.getActivity(
        this,
        0,
        authenticationIntent,
        PendingIntent.FLAG_CANCEL_CURRENT or mutablePendingIntentFlag()
    )
    val authenticatedDataset = Dataset.Builder(presentation).apply {
      setAuthentication(authentication.intentSender)
      fields.forEach { field ->
        setValue(field.id, null)
      }
    }.build()
    callback.onSuccess(
        FillResponse.Builder()
            .addDataset(authenticatedDataset)
            .build()
    )
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }

  private fun collectFillableFields(
      node: android.app.assist.AssistStructure.ViewNode,
      fields: MutableList<AutofillField>
  ) {
    val autofillId = node.autofillId
    val credentialSignal = credentialFieldSignal(node)
    if (autofillId != null && credentialSignal != null) {
      fields += AutofillField(autofillId, credentialSignal.role, credentialSignal.isStrongSignal)
    }

    for (index in 0 until node.childCount) {
      collectFillableFields(node.getChildAt(index), fields)
    }
  }

  private fun credentialFieldSignal(
      node: android.app.assist.AssistStructure.ViewNode
  ): CredentialFieldSignal? {
    val metadata = credentialMetadata(node)
    if (looksLikeSearchField(metadata)) return null

    val hints = node.autofillHints.orEmpty().map { it.lowercase() }
    if (hints.any { hint -> hint.contains("password") }) {
      return CredentialFieldSignal(rolePassword, true)
    }
    if (hints.any { hint -> hint.contains("username") || hint.contains("email") }) {
      return CredentialFieldSignal(roleUsername, true)
    }

    val inputType = node.inputType
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    val textClass = inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT
    val passwordVariation = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
    val emailVariation = variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS

    if (textClass && passwordVariation) return CredentialFieldSignal(rolePassword, true)
    if (textClass && emailVariation) return CredentialFieldSignal(roleUsername, true)

    if (metadata.contains("password") ||
        metadata.contains("current-password") ||
        metadata.contains("new-password")
    ) {
      return CredentialFieldSignal(rolePassword, true)
    }
    if (metadata.contains("username") ||
        metadata.contains("user-name") ||
        metadata.contains("login") ||
        metadata.contains("email")
    ) {
      return CredentialFieldSignal(roleUsername, true)
    }

    val genericTextField = node.autofillType == View.AUTOFILL_TYPE_TEXT || textClass
    if (genericTextField) return CredentialFieldSignal(roleUsername, false)

    return null
  }

  private fun credentialMetadata(node: android.app.assist.AssistStructure.ViewNode): String {
    return listOf(
        node.hint,
        node.idEntry,
        node.autofillHints?.joinToString(" "),
        node.htmlInfo?.attributes?.joinToString(" ") { attribute ->
          "${attribute.first} ${attribute.second}"
        }
    )
        .joinToString(" ")
        .lowercase()
  }

  private fun looksLikeSearchField(metadata: String): Boolean {
    return metadata.contains("search") ||
        metadata.contains("query") ||
        metadata.contains("find") ||
        metadata.contains("filter")
  }

  private fun mutablePendingIntentFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_MUTABLE
    } else {
      0
    }
  }

  private data class AutofillField(
      val id: AutofillId,
      val role: String,
      val isStrongSignal: Boolean
  )

  private data class CredentialFieldSignal(
      val role: String,
      val isStrongSignal: Boolean
  )
}
