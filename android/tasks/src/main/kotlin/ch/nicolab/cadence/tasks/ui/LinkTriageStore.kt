package ch.nicolab.cadence.tasks.ui

import android.content.Context
import androidx.core.content.edit

private const val PREFS = "cadence_link_triage"
private const val KEY_SKIPPED = "skipped"

/**
 * Ce que le tri des liens retient sur l'appareil : les idées passées, dans leur ordre. La date de revue d'un lien
 * mis de côté est synchronisée (`review_at`, docs/37-links.md).
 */
internal class LinkTriageStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun skipped(): List<String> = prefs.getString(KEY_SKIPPED, null)?.split(',')?.filter { it.isNotBlank() }.orEmpty()

    fun saveSkipped(uids: List<String>) = prefs.edit { putString(KEY_SKIPPED, uids.joinToString(",")) }

}
