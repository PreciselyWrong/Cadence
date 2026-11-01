package ch.nicolab.cadence.tasks.reminder

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.domain.ReminderLead
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * « Rappeler les tâches à heure fixe » : une tâche qui a une heure d'échéance et aucun rappel explicite sonne à
 * cette heure, [lead] avant. Activé et « à l'heure » par défaut. Un rappel explicite (`reminder_at`) l'emporte.
 */
data class TimedReminders(val enabled: Boolean = true, val lead: ReminderLead = ReminderLead.AT_TIME) {
    companion object {
        val OFF = TimedReminders(enabled = false)
    }
}

/** Réglage enregistré sur l'appareil seulement (`cadence_task_reminders`), jamais synchronisé. */
class TimedRemindersStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): TimedReminders = TimedReminders(
        enabled = preferences.getBoolean(KEY_ENABLED, true),
        lead = ReminderLead.ofMinutes(preferences.getLong(KEY_LEAD, 0L), ReminderLead.AT_TIME),
    )

    fun write(settings: TimedReminders) {
        preferences.edit {
            putBoolean(KEY_ENABLED, settings.enabled)
            putLong(KEY_LEAD, settings.lead.minutes)
        }
    }

    /** Émet la valeur courante puis chaque changement. */
    fun changes(): Flow<TimedReminders> = callbackFlow {
        send(read())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(read()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }.distinctUntilChanged()

    private companion object {
        const val PREFERENCES_NAME = "cadence_task_reminders"
        const val KEY_ENABLED = "timed_enabled"
        const val KEY_LEAD = "timed_lead_minutes"
    }
}
