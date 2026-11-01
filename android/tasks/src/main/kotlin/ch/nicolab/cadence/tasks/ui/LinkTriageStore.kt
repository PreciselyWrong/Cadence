package ch.nicolab.cadence.tasks.ui

import android.content.Context
import androidx.core.content.edit
import java.time.LocalDate

private const val PREFS = "cadence_link_triage"
private const val KEY_SKIPPED = "skipped"
private const val KEY_REVIEW = "review_"

/**
 * Ce que le tri des liens retient sur l'appareil : les idées passées (leur ordre) et la date de revue des liens
 * mis de côté. Le serveur n'a pas de champ de revue : la date reste locale (voir docs/37-links.md).
 */
internal class LinkTriageStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun skipped(): List<String> = prefs.getString(KEY_SKIPPED, null)?.split(',')?.filter { it.isNotBlank() }.orEmpty()

    fun saveSkipped(uids: List<String>) = prefs.edit { putString(KEY_SKIPPED, uids.joinToString(",")) }

    fun reviewOn(linkUid: String): LocalDate? =
        prefs.getLong(KEY_REVIEW + linkUid, NONE).takeIf { it != NONE }?.let(LocalDate::ofEpochDay)

    fun setReviewOn(linkUid: String, date: LocalDate) = prefs.edit { putLong(KEY_REVIEW + linkUid, date.toEpochDay()) }

    private companion object {
        const val NONE = Long.MIN_VALUE
    }
}
