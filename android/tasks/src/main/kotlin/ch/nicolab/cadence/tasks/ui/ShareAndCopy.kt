package ch.nicolab.cadence.tasks.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent

/** Ouvre la feuille de partage système avec [text] (texte brut). */
internal fun Context.shareText(text: String, subject: String?) {
    val send = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, text)
        .apply { subject?.let { putExtra(Intent.EXTRA_SUBJECT, it) } }
    startActivity(Intent.createChooser(send, null))
}

internal fun Context.copyText(label: String, text: String) {
    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(label, text))
}
