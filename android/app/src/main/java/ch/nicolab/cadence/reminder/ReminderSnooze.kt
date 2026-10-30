package ch.nicolab.cadence.reminder

import android.content.Context
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEvaluation
import java.time.ZonedDateTime

data class PendingSnooze(
    val habitId: String,
    val reminderId: String,
    val triggerAtEpochMilli: Long,
)

object ReminderSnooze {
    const val SNOOZE_MINUTES = 30L

    fun nextTrigger(now: ZonedDateTime, minutes: Long = SNOOZE_MINUTES): ZonedDateTime {
        require(minutes >= SNOOZE_MINUTES)
        return now.plusMinutes(minutes)
    }

    /**
     * Décide de la livraison d'un rappel reporté : vérifie la relation avec le rappel d'origine
     * et réévalue l'état actuel de l'habitude (active, non archivée, non suspendue, planifiée ce
     * jour et requérant attention).
     */
    fun shouldDeliverSnooze(
        habit: PersistedHabit?,
        reminder: HabitReminderEntity?,
        evaluation: HabitEvaluation?,
    ): Boolean {
        if (habit == null || reminder == null || evaluation == null) return false
        if (reminder.habitId != habit.id) return false
        if (!reminder.enabled) return false
        if (!habit.active || habit.archived) return false
        if (evaluation.isPaused) return false
        if (!evaluation.isPlannedForDate) return false
        if (!evaluation.needsAttentionNow) return false
        return true
    }
}

object ReminderSnoozeStore {
    private const val PREFS_NAME = "cadence_reminder_snooze"

    fun save(context: Context, habitId: String, reminderId: String, triggerAtEpochMilli: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(habitId, "$reminderId:$triggerAtEpochMilli").commit()
    }

    fun remove(context: Context, habitId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(habitId).commit()
    }

    fun get(context: Context, habitId: String): PendingSnooze? =
        getAll(context).firstOrNull { it.habitId == habitId }

    fun getAll(context: Context): List<PendingSnooze> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.all.mapNotNull { (habitId, value) ->
            val str = value as? String ?: return@mapNotNull null
            val separator = str.lastIndexOf(':')
            if (separator <= 0 || separator == str.lastIndex) return@mapNotNull null
            val reminderId = str.substring(0, separator)
            val triggerAt = str.substring(separator + 1).toLongOrNull() ?: return@mapNotNull null
            PendingSnooze(habitId, reminderId, triggerAt)
        }
    }
}
